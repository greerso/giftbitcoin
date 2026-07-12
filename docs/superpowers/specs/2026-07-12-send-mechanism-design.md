# Send Mechanism — Design

**Date:** 2026-07-12 · **Status:** Decisions user-approved; rev 2 pending review
(critical-assessment fixes applied; architecture decided: Cloudflare Worker) ·
**Scope:** v1.x feature

## Problem

GiftBitcoin has no send affordance. After funding, the sender gets a claim link and is left
to deliver it however they can figure out. That's a UX gap ("I see no send mechanisms"),
and the naive fixes (mailto:, in-app DM integrations) either stay clunky or leak a bearer
secret to a third party.

Research basis: 4-topic web-research sweep + adversarial verification (2026-07-12, 15 agents,
10/11 spot-checked claims confirmed, 1 refuted in our favor). Key verified facts used below:

- Web Share API: ~90% global support; missing on Firefox desktop and Chrome/Chromium on
  desktop Linux; fragment survives intact into the OS share sheet; zero server involvement.
- WhatsApp `wa.me/?text=` (contact picker, E2EE, sender-side previews) and iMessage
  `sms:?&body=` are the only *safe* per-messenger prefill links. Telegram stores message
  text server-side (cloud chats, non-E2EE by default); X force-wraps DM links in t.co (and
  the compose-with-text deep link died in the XChat migration — verified live); Messenger
  routes shares through Meta crawlers. Signal has no prefill link (share-sheet only).
- X "encrypted" DMs (XChat): unaudited, no forward secrecy, keys escrowed behind a 4-digit
  PIN on X servers. Disqualified as a secret channel.
- Crack economics of a leaked link at Argon2id m=64MiB t=3 (the link is an offline oracle:
  it carries the salt `claim_secret` and target `C_xonly`): human-chosen passphrase
  (20–30 bits) ≈ $0.05–$52 — below breakeven for a $100 gift; generated 4-word EFF diceware
  (51.7 bits) ≈ $1.8e8 — clears a $10k gift vs a 100× ASIC attacker by ~180×
  ($1.8e8 ÷ (100 × $10k)).
- Prior art (16 products): no non-custodial bearer-secret product sends in-product; only
  custodial escrows email recipients. Secret-sharing services (OneTimeSecret, 1Password)
  converge on "link via one channel, second factor via another." One-time-view links are
  net-negative for money (email prefetch bots burn the view).

## Decisions (user-approved)

1. **Human-chosen passphrases are removed entirely.** Wherever a passphrase exists, it is
   generated in the browser: 4 words, EFF large wordlist (7776 words, 51.7 bits), CSPRNG
   with rejection sampling, lowercase, single-space separated, NFC-normalized (SPEC 4.2.4).
2. **Passphrase is forced for server-sent gifts; opt-in for self-sent gifts.** When a
   self-sent gift opts in, the QR variant embeds link+passphrase for single-scan in-person
   handoff; the plain link never includes it.
3. **Generation is client-side only.** The server never sees or generates the passphrase —
   if it did, it would hold both factors, which is custody. Enforcement is structural: the
   funded address commits to Argon2id(passphrase), so no weaker secret can be substituted.
4. **Server delivery is send-and-forget.** No persistence, no resend, no scheduled delivery
   in this iteration. Losing the email is survivable: server-sent gifts default to the
   existing `refund_self` policy (CSV expiry) — the non-custodial equivalent of the
   "auto-return" that custodial products offer.

## Design

### Tier 1 — client-side share (no server change)

On the create page's share step (Step 3 of 3):

- **Primary:** a Share button calling `navigator.share({url})`, shown when
  `navigator.canShare?.({url}) ?? !!navigator.share` (some engines ship `share` without
  `canShare`) — covers AirDrop, iMessage, WhatsApp, Signal, Telegram, anything installed.
  Put the link in the `url` field (some iOS targets drop `text` when both are present).
- **Fallback:** the existing copy-link button (mandatory anyway for Firefox desktop).
- **Optional dedicated buttons:** WhatsApp (`https://wa.me/?text=<urlencoded link>`) and
  Messages (`sms:?&body=<urlencoded link>` — the iOS-compatible ampersand form).
- **Explicitly not offered:** Telegram, X, Messenger buttons (each leaks the link to the
  platform), and Nostr (niche; YAGNI).

### Tier 2 — server email delivery

The delivery choice is made at **create step 1, before funding** — the address must commit
to the passphrase, so it can't be added later. Choosing "Email it for them" generates the
4 words immediately and forces passphrase mode. On the share step the sender then enters the
recipient email (+ optional sender name, short message ≤280 chars) → POST to server →
confirmation screen re-shows the 4 words with instruction: *"Now text or tell them these
4 words — the email alone can't claim the gift."*

Consequence, stated in the UI at create time: a gift created without a passphrase can never
use email delivery (the commitment is immutable once funded). The reverse is fine — an
email-delivery gift can still be shared manually.

**Architecture note:** the app today is fully static (`adapter-static` + nginx — one
container, no proxy config; the browser talks to esplora directly). `/api/send` is the
**first server-side component in this project**, and it is a **Cloudflare Worker + Email
Service on the existing zone**, routed at `giftbitcoin.app/api/send`. Decided here, not at
implementation: bolting a relay onto the single-container static deployment would mean a
second service or an in-container process manager, while the Worker leaves the origin
untouched. The mail capability is a Worker binding/secret, rate-limit counters use the
Workers rate-limiting binding, and the client IP is `CF-Connecting-IP` — set by Cloudflare
itself at the edge, so there is no reverse-proxy header-trust chain to pin (behind the
origin's cloudflared → Traefik → nginx chain, per-IP limiting would otherwise see only
proxy IPs, or trust a spoofable forwarded header).

The Worker's funding check is a **new server-side dependency** — there is no existing
esplora backend; today's esplora code is client-side fetch against the public
`mempool.space/testnet4` API. The Worker makes the same call server-side with a hard 5 s
timeout, **fails closed** (no email on esplora failure — the sender gets the copy-link
fallback), and caches funded-address lookups for 60 s via the Cache API (`caches.default`,
keyed on the esplora URL — public chain data, no link material) so duplicate taps and
retries don't re-hit the rate-limited public API.

**Endpoint:** `POST /api/send`

```json
{ "to": "recipient@example.com", "link": "https://giftbitcoin.app/c#g1.<share_card_b64url>",
  "from_name": "optional, ≤64 chars", "message": "optional, ≤280 chars, plain text",
  "turnstile_token": "required — see anti-abuse below" }
```

Server behavior (send-and-forget relay):

- Validate: link matches our origin + `g1.` grammar; **reject any link carrying a passphrase
  segment** (below); parse the embedded `share_card`; **recompute the taproot address from
  the card's script fields** (NUMS/C/R/T, SPEC §5.2) and require it to equal `script.address`
  — without recomputation, any funded address copied off a block explorer passes the funding
  check. (This pulls taproot/NUMS derivation into the Worker.) Then verify the recomputed
  address has ≥1 confirmation via the server-side esplora call above.
- Require `passphrase_required: true`. This binds only the **honest UI path**: the flag is
  sender-controlled JSON, and the server can't verify the address actually commits to an
  Argon2id output without the passphrase it must never see. It's a UX guard, not an abuse
  control — a forged card can set it.
- Anti-abuse: the funded-gift check is a **speed bump only on testnet4** (faucet funding is
  free), so it can't be the mechanism that prevents use as a free email cannon. The real
  gates: a required Turnstile token on the send form, plus rate limits per client IP
  (`CF-Connecting-IP`) and per gift address (counters keyed on `hash(address)`, never the
  link). Turnstile costs a CSP allowlist entry — see SPEC amendments.
- Sanitize `from_name`/`message` into a fixed template (no HTML injection, no user-controlled
  links other than the claim link).
- Send via the Email Service binding; return 200/4xx; **store nothing persistent** (no DB
  row, no log line containing the link; the ephemeral rate-limit counters and the 60 s
  funding-check cache are the only server state).

**Email content:** fixed branded template — "Someone sent you a Bitcoin gift" + claim link +
"the sender will give you 4 secret words to open it." Never the passphrase, obviously.

### Fragment grammar extension (QR embed for self-sent opt-in)

Current claim fragment: `g1.<share_card_b64url>`. Add an optional third dot-separated
segment: `g1.<share_card_b64url>.<passphrase_b64url>` where the payload is
base64url(UTF-8 NFC passphrase). Properties:

- Dots don't occur in base64url, so parsing stays unambiguous; existing two-segment links
  are unchanged.
- It rides in the fragment, and its only emitting path is the QR below, scanned client-side
  — so it never reaches any server. (Emailed links are different: corporate mail rewriters —
  Outlook SafeLinks, Proofpoint URL Defense — embed the full URL, fragment included, in their
  wrapper URLs. One more reason the passphrase is forced for email and the three-segment form
  is never emailed.)
- Parsing is extended in the **shared** `parseShareCardFragment` in `gift-package.ts`, not in
  the claim page: its consumers (`/c`, `/recover`, the create round-trip self-check) must all
  accept a third segment — a scanned link pasted into `/recover` must not read as corrupt.
- The claim page, on seeing the third segment, derives directly and skips the prompt. If the
  embedded passphrase fails to derive the committed key, fall back to the manual prompt —
  never dead-end in a wrong-key error.
- Only the **QR rendering** for self-sent opt-in gifts uses the combined form. Copy-link and
  share buttons always emit the two-segment link. The `/api/send` endpoint rejects
  three-segment links outright.

### Claim UX (passphrase gifts)

Recipient opens the link → passphrase prompt: "Enter the 4 secret words from the sender."
Input is case-insensitive, whitespace-collapsed, then NFC-normalized before Argon2id — the
recipient can type `Correct  Horse battery staple` and still claim. **Back-compat:** today's
derivation is NFC-only and already-funded gifts may carry human-chosen passphrases (the old
free-text input), so derive with the normalized input first and, on commitment mismatch,
retry once with the raw NFC-only input — pre-existing gifts stay claimable without a version
marker. Existing Argon2id WASM path is unchanged (SPEC 4.2.4). The site-wide CSP is **not**
unchanged — the Turnstile widget on the send form forces a `challenges.cloudflare.com`
allowlist entry (see SPEC amendments); nothing in the claim flow itself touches the CSP.

### Create-flow changes

- Remove the free-text "Require passphrase" input. Replace with a delivery choice at step 1:
  **"How will you deliver it?"** → *I'll share it myself* (passphrase optional toggle,
  generated if on) / *Email it for them* (passphrase forced, `refund_self` default on).
- The 4 words are **not** included in `sender_full_backup` or any package variant — SPEC
  line 163 (passphrase never stored) stands. They are shown on screen at create time with
  "write these down / you'll send them separately" and re-shown on the share step. Losing
  them means the recipient can't claim; `refund_self` recovers the funds.
- Claim-link QR rendering is **new work**: the current "QR" is a placeholder div for the
  funding address and no QR library exists in the repo. Pick a small renderer; the combined
  three-segment fragment pushes the payload toward ~1 KB, so verify density/scannability on
  real phone cameras before shipping the variant.

### SPEC amendments required

- **The four normative rules the relay directly violates** — each needs an explicit
  carve-out, not silence, or the SPEC becomes self-contradictory and the design fails its
  own frozen gate:
  - §5.1 ("Claim secret **must not** be sent to the website process"): amend — a
    passphrase-committed `share_card` MAY be transiently relayed via `/api/send`; never
    persisted, never logged.
  - §10.1 (Optional lightweight API — "**no secrets**"): add the `/api/send` row with the
    same carve-out.
  - §13 ("No secret to API"): scope to the claim flow.
  - §14.3.3 (frozen success criterion, enforced by `tests/lib/secrets-never-sent.test.ts`):
    re-scope the test explicitly to the claim flow so the send path doesn't fail the gate.
- §13 CSP row (`default-src 'self'; connect-src indexer allowlist`, mirrored in
  `svelte.config.js`) — forced by the Turnstile gate, not by the relay itself: add
  `https://challenges.cloudflare.com` to `script-src` and `frame-src`. SvelteKit's CSP is one
  site-wide config, so the entry applies to every page, not just the send form.
- §Trust model (line ~60): add row — server MAY transiently relay a passphrase-protected
  `share_card` for email delivery; it never persists it and never sees the passphrase. Name
  every link holder the email path creates: Cloudflare (one party wearing two hats — the
  edge sees the POST body, and Email Service delivery logs may retain sent bodies), the
  recipient mailbox (indefinitely), and corporate mail link-rewriters (SafeLinks/Proofpoint
  wrappers). All are mitigated by the forced ≥51.7-bit second factor (~$1.8e8 to crack at
  current Argon2id params) — that retention is *why* the passphrase is forced for email.
- §Non-goals: "Server-held claim secrets" stays; clarify "held" = persisted. Add explicit
  non-goals: scheduled delivery, resend, one-time-view retrieval (bot-burn failure mode),
  Telegram/X/Messenger integrations.
- §4.2.4 / UI: passphrases are always site-generated 4-word EFF diceware; human-chosen
  passphrases removed.
- §7.1 step 6 (Optional "Require passphrase" free-text) and §12.1 copy ("Explain passphrase
  as second factor when sharing via email/chat"): both describe UI this design replaces;
  update to the delivery-choice + generated-4-words flow.
- §5.4: three-segment fragment grammar (QR-embed variant).
- Recommended-share-UX section: Web Share API primary, per-channel triage table.

## Error handling

- `navigator.share` rejection (user cancel / unsupported) → silently fall back to visible
  copy button (already exists).
- `/api/send` failure (Email Service error, Turnstile failure, or esplora timeout — the
  Worker fails closed) → inline error + "copy the link and send it yourself" fallback; the
  link always exists client-side, so email failure never strands the gift.
- Duplicate send taps → each tap inside the rate window sends another email, up to the
  per-address cap; no dedup — that would require persistent state, and the ephemeral
  rate-limit counters plus the 60 s funding-check cache are deliberately the only server
  state.
- Provider acceptance ≠ delivery: bounces are silent under send-and-forget. Confirmation
  copy says "handed to the mail system — confirm it arrived when you send them the 4 words,"
  never "delivered." A bounce is survivable: the sender taps send again (within the rate cap
  — there is no server-side resend feature, per Decision 4) or shares manually; `refund_self`
  backstops.
- Recipient passphrase typos → normalization above; after 3 failed derivations show "check
  the words with the sender" (derivation is client-side; no lockout is possible or needed).

## Testing

- Unit: wordlist generation (uniformity via rejection sampling; duplicate words permitted —
  independent draws, entropy = 4 × log2(7776)); fragment grammar round-trip (2- and 3-segment, reject
  malformed); passphrase input normalization (case/whitespace/NFC) against existing
  Argon2id test vectors.
- Endpoint: origin/grammar validation, three-segment rejection, address-recomputation
  mismatch rejection, unfunded-gift rejection, esplora-timeout fail-closed, Turnstile
  verification, template sanitization (HTML/header injection), rate limiting.
- Back-compat: claim retry-with-raw-input against a gift created with a pre-normalization
  human passphrase; `/recover` accepts a three-segment link.
- Integration: create-with-delivery-choice → fund (testnet4) → email relayed → claim via
  prompt; self-sent opt-in → QR combined fragment → single-scan claim.
- E2E share buttons: `navigator.share` mocked; deep-link URLs asserted (encoding of full
  link, ampersand `sms:` form).

## Non-goals (this iteration)

Scheduled/birthday delivery, resend, SMS sending by the server, Nostr DMs, one-time-view
links, any Telegram/X/Messenger integration, passphrase strength options (fixed at 4 words).
