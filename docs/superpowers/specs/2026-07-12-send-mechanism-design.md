# Send Mechanism — Design

**Date:** 2026-07-12 · **Status:** Approved pending user review · **Scope:** v1.x feature

## Problem

GiftBitcoin has no send affordance. After funding, the sender gets a claim link and is left
to deliver it however they can figure out. That's a UX gap ("I see no send mechanisms"),
and the naive fixes (mailto:, in-app DM integrations) either stay clunky or leak a bearer
secret to a third party.

Research basis: 4-topic web-research sweep + adversarial verification (2026-07-12, 15 agents,
10/11 spot-checked claims confirmed, 1 refuted in our favor). Key verified facts used below:

- Web Share API: ~90% global support; everything except Firefox desktop; fragment survives
  intact into the OS share sheet; zero server involvement.
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
  (51.7 bits) ≈ $1.8e8 — clears a $10k gift vs a 100× ASIC attacker by ~256×.
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

- **Primary:** a Share button calling `navigator.share({url})` behind `canShare()` —
  covers AirDrop, iMessage, WhatsApp, Signal, Telegram, anything installed. Put the link in
  the `url` field (some iOS targets drop `text` when both are present).
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

**Architecture note:** the app today is fully static (`adapter-static` + nginx; the browser
talks to esplora directly). `/api/send` is the **first server-side component in this
project**. Keep it proportionate: a single-endpoint relay service in this repo, proxied at
`/api/` by the existing nginx, same Coolify deployment; it holds one secret (mail-provider
API key) and the rate-limit state. Alternative if we'd rather keep the origin static: a
Cloudflare Worker + Email Service on the existing zone. Decide at implementation; the
endpoint contract is identical either way.

**Endpoint:** `POST /api/send`

```json
{ "to": "recipient@example.com", "link": "https://giftbitcoin.app/c#g1.<share_card_b64url>",
  "from_name": "optional, ≤64 chars", "message": "optional, ≤280 chars, plain text" }
```

Server behavior (send-and-forget relay):

- Validate: link matches our origin + `g1.` grammar; **reject any link carrying a passphrase
  segment** (below); parse the embedded `share_card`, require `passphrase_required: true`;
  verify the gift address has ≥1 confirmation via the existing esplora backend (anti-spam:
  the relay only sends funded gifts — this prevents use as a free email cannon).
- Sanitize `from_name`/`message` into a fixed template (no HTML injection, no user-controlled
  links other than the claim link).
- Rate limit per IP and per gift address.
- Send via the transactional mail provider; return 200/4xx; **store nothing** (no DB row,
  no log line containing the link).

**Email content:** fixed branded template — "Someone sent you a Bitcoin gift" + claim link +
"the sender will give you 4 secret words to open it." Never the passphrase, obviously.

### Fragment grammar extension (QR embed for self-sent opt-in)

Current claim fragment: `g1.<share_card_b64url>`. Add an optional third dot-separated
segment: `g1.<share_card_b64url>.<passphrase_b64url>` where the payload is
base64url(UTF-8 NFC passphrase). Properties:

- Dots don't occur in base64url, so parsing stays unambiguous; existing two-segment links
  are unchanged.
- It's a fragment, so it never reaches any server (ours or a preview bot's).
- The claim page, on seeing the third segment, derives directly and skips the prompt.
- Only the **QR rendering** for self-sent opt-in gifts uses the combined form. Copy-link and
  share buttons always emit the two-segment link. The `/api/send` endpoint rejects
  three-segment links outright.

### Claim UX (passphrase gifts)

Recipient opens the link → passphrase prompt: "Enter the 4 secret words from the sender."
Input is case-insensitive, whitespace-collapsed, then NFC-normalized before Argon2id — the
recipient can type `Correct  Horse battery staple` and still claim. Existing Argon2id WASM
path and CSP are unchanged (SPEC 4.2.4).

### Create-flow changes

- Remove the free-text "Require passphrase" input. Replace with a delivery choice at step 1:
  **"How will you deliver it?"** → *I'll share it myself* (passphrase optional toggle,
  generated if on) / *Email it for them* (passphrase forced, `refund_self` default on).
- The 4 words are **not** included in `sender_full_backup` or any package variant — SPEC
  line 163 (passphrase never stored) stands. They are shown on screen at create time with
  "write these down / you'll send them separately" and re-shown on the share step. Losing
  them means the recipient can't claim; `refund_self` recovers the funds.

### SPEC amendments required

- §Trust model (line ~60): add row — server MAY transiently relay a passphrase-protected
  `share_card` for email delivery; it never persists it and never sees the passphrase;
  posture quantified at ≥51.7 bits (~$1.8e8 to crack at current Argon2id params).
- §Non-goals: "Server-held claim secrets" stays; clarify "held" = persisted. Add explicit
  non-goals: scheduled delivery, resend, one-time-view retrieval (bot-burn failure mode),
  Telegram/X/Messenger integrations.
- §4.2.4 / UI: passphrases are always site-generated 4-word EFF diceware; human-chosen
  passphrases removed.
- §5.4: three-segment fragment grammar (QR-embed variant).
- Recommended-share-UX section: Web Share API primary, per-channel triage table.

## Error handling

- `navigator.share` rejection (user cancel / unsupported) → silently fall back to visible
  copy button (already exists).
- `/api/send` failure → inline error + "copy the link and send it yourself" fallback; the
  link always exists client-side, so email failure never strands the gift.
- Duplicate send taps → rate limit tolerates a re-send of the same funded gift (idempotent
  from the sender's view); still no server state.
- Recipient passphrase typos → normalization above; after 3 failed derivations show "check
  the words with the sender" (derivation is client-side; no lockout is possible or needed).

## Testing

- Unit: wordlist generation (uniformity via rejection sampling; duplicate words permitted —
  independent draws, entropy = 4 × log2(7776)); fragment grammar round-trip (2- and 3-segment, reject
  malformed); passphrase input normalization (case/whitespace/NFC) against existing
  Argon2id test vectors.
- Endpoint: origin/grammar validation, three-segment rejection, unfunded-gift rejection,
  template sanitization (HTML/header injection), rate limiting.
- Integration: create-with-delivery-choice → fund (testnet4) → email relayed → claim via
  prompt; self-sent opt-in → QR combined fragment → single-scan claim.
- E2E share buttons: `navigator.share` mocked; deep-link URLs asserted (encoding of full
  link, ampersand `sms:` form).

## Non-goals (this iteration)

Scheduled/birthday delivery, resend, SMS sending by the server, Nostr DMs, one-time-view
links, any Telegram/X/Messenger integration, passphrase strength options (fixed at 4 words).
