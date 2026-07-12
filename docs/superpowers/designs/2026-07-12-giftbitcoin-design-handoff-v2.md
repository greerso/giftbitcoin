# GiftBitcoin — Claude Design Handoff v2

**Source project:** "Giftoin Bitcoin e-giftcards" (`54d56c40-9ac0-4461-b83e-b81d2fe5324e`)
**Editor link:** https://claude.ai/design/p/54d56c40-9ac0-4461-b83e-b81d2fe5324e
**Files:** `GiftBitcoin Design.dc.html` (brand + prototype canvas, unchanged), `GiftBitcoinApp.dc.html` (the clickable component — updated)
**Exported to repo:** `docs/superpowers/designs/assets/` (overwritten in place; no new/removed files)
**Compared against:** the currently shipped SvelteKit app (`src/routes/`, `src/lib/`) at commit `a3ff6f6` — includes send-mechanism PR #14 (delivery choice, generated 4-word passphrases, `/api/send` email relay, share tier, QR)
**Supersedes:** [`2026-07-12-giftbitcoin-design-handoff.md`](2026-07-12-giftbitcoin-design-handoff.md) (v1) — read this file for the design tokens, full screen prose, and the copy-drift items that are still open; this file only covers what changed.

No auth was required — the project was reachable directly via the `claude_design` MCP tools.

---

## 1. Headline: the design caught up to the shipped send mechanism

v1 (imported before PR #14 merged) showed a static passphrase checkbox and no delivery/email
UX. v2's `GiftBitcoinApp.dc.html` was re-authored since and now models almost exactly what's
already shipped on `main`: delivery choice (self vs. email), forced-vs-opt-in generated
4-word passphrase, the backup-before-send gate, Tier 1 client share (Web Share API +
WhatsApp/Messages links), Tier 2 email relay with inline confirmation, the gift-link QR, and
the Share-card/Watch-only downloads. Copy strings match the shipped Svelte components close
to verbatim (see §3).

**The one genuinely new, unshipped piece of UX in v2 is a fiat/BTC amount-denomination
toggle with locale-based currency detection** (§2, §4). Everything else in the diff is the
design doc catching up to reality, not new product surface.

Only `GiftBitcoinApp.dc.html` changed — `GiftBitcoin Design.dc.html` (brand canvas: logo
concepts, color, type) is byte-identical to the v1 export, and no new/removed assets (SVGs,
`support.js`) appeared in `list_files`. Diff scope was entirely inside the Create flow
(C1 amount/delivery, C3 pay, C4 ready) — Home, all Claim screens, Help, and Recover are
unchanged from v1.

---

## 2. What changed (design doc, v1 → v2)

### New: fiat/BTC denomination toggle (C1 amount field) — **not shipped**

- Amount input becomes a single field with a left-edge toggle (`{{ fiatCode }}` / BTC, with
  a swap-arrow icon) instead of the v1 "4 presets row + separate custom-USD box" layout.
- `componentDidMount` detects a fiat currency from `Intl.DateTimeFormat().resolvedOptions().locale`
  region (fallback `navigator.language`), mapped: `US→USD $, GB→GBP £, CA→CAD $, AU→AUD $,
  JP→JPY ¥, IN→INR ₹, NG→NGN ₦, BR→BRL R$, MX→MXN $, CH→CHF, ZA→ZAR R`, plus `DE/FR/ES/IT/
  NL/IE/PT/AT → EUR €`. Unmapped regions stay on USD.
- Regions `SV` (El Salvador) and `CF` (Central African Republic) — the two countries where
  bitcoin is legal tender — default the toggle to BTC-denominated entry instead of fiat.
- Preset chips switch with the toggle: fiat presets stay `$25/$50/$100/$250`; BTC presets are
  `0.0005/0.001/0.0025/0.005`. "Custom" chip works in either denomination.
- Helper copy changes with denomination: fiat mode keeps v1's "...about **{btc} BTC** at
  today's rate."; BTC mode shows "...about **{btc} BTC** (≈ {fiat amount})".
- `canWebShare` detection (`!!navigator.share`) was also folded into `componentDidMount` in
  this same pass — already shipped, no action needed (§3).

### Confirmed matching shipped app (no action needed, listed for completeness)

- **Delivery choice** ("I'll share it myself" / "Email it for them") with identical opt-in/
  forced-passphrase copy and the "locked in when you fund it" warning — matches
  `src/routes/create/+page.svelte:405-444` near verbatim.
- **4-word passphrase box** (generate/copy, "never stored in your backup") — matches
  `src/lib/crypto/passphrase.ts` + create page `words-box` styling.
- **Old single passphrase checkbox+input (v1) is gone** — replaced by the delivery/words
  system in both the design doc and the shipped app.
- **Network fee speed selector removed from Advanced options** — the design doc dropped the
  Economy/Standard/Priority chip row entirely; the app already has no fee-speed picker (fee
  is fixed at claim time, not chosen at create time).
- **Tip copy** updated to "Project tip — suggested" + "recorded in your backup for the
  open-source project — tip collection isn't wired up in this testnet build" — matches
  `+page.svelte:466-469` exactly.
- **C3 "Save your gift before you send" warning box** (Download backup / Copy link buttons
  above the pay QR) and lede copy "Send at least **{btc} BTC** ({fiat}) to this address.
  Testnet coins, no real value." — matches shipped.
- **"I've sent it" gated on backup** (disabled + "Save your backup first ↑" until
  `backedUp`) — matches `+page.svelte:530-531`.
- **C4 ready screen**: 4-words recap box, inline email-send form (recipient email + Turnstile
  slot + "Send the gift email" + sent-confirmation state), Web Share primary button +
  WhatsApp/Messages links, "Gift link QR" with conditional 2-segment/3-segment note, "Share
  card file" / "Watch-only" downloads — all present and copy-matching in
  `+page.svelte:580-636`.

---

## 3. Design tokens

No token changes — colors, type, radii, spacing, and the four gift-card gradients are
unchanged from v1 (see v1 §1 for the full table). Two new inline style helpers appear in the
component logic, not worth promoting to a token table entry:

- `denomLabelStyle(on)` — 12px 700-weight Instrument Sans, `#C97210` active / `#B4A98F`
  inactive, used for the `{{ fiatCode }}` / `BTC` toggle labels.
- `amountFieldStyle` — replaces v1's `customBoxStyle`; a 14px-radius bordered flex row
  (66px min-height) instead of the old 12px-radius single-line box, to fit the new
  denomination-toggle rail on the left edge.

---

## 4. Implementer checklist

### Must-have (design/app are already aligned — verify only, no new build)

- [ ] Spot-check the exact copy strings above against `+page.svelte` next time either file
      changes — they match today but nothing pins them together, so drift is silent.
- [ ] v1's still-open items remain open and are unaffected by this update: home H1/lede/
      bullet-3 copy reconciliation, eyebrow badge decision, testnet-strip punctuation, Claim
      R1 paste-option copy, logo concepts B/C fate (see v1 §4 for the full list).

### New work, if the fiat/BTC toggle is wanted

- [ ] **Price source**: `mempool.space/api/v1/prices` (already used by `src/lib/pricing.ts`)
      returns `USD/EUR/GBP/CAD/CHF/AUD/JPY` — covers 6 of the design's 10 mapped currencies
      directly (swap `j.USD` for `j[fiatCode]`). **INR, NGN, BRL, MXN, ZAR have no field in
      that response** — either drop them from the locale map, or add a second price source
      for those five, before wiring the toggle up to real rates.
  - [ ] Decide fallback behavior when the detected fiat isn't priced (design doc doesn't
        specify — falling back to USD display with a note is the obvious default).
  - [ ] `FALLBACK_BTC_USD` in `pricing.ts` is USD-only; a per-currency fallback constant (or
        a fallback that always renders in USD) is needed if the price fetch fails.
- [ ] Rework `src/routes/create/+page.svelte` C1 amount block: single toggle-rail input
      (replacing the current presets-row + separate custom-box), BTC preset set, and the
      conditional helper copy — mirrors `amountFieldStyle`/`presets`/`amountTail` in the
      updated `GiftBitcoinApp.dc.html`.
  - [ ] Everywhere downstream that reads `usdAmount` (fee math, tip math, `gift-package.ts`
        payload, C3/C4 display strings) needs to key off a denomination-aware amount instead
        — audit call sites before wiring the toggle live, this is the highest-risk part of
        the change.
- [ ] Locale detection (`Intl.DateTimeFormat().resolvedOptions().locale` → region → currency
      map) is new client code, ~30 lines per the mock's `componentDidMount` — low risk,
      display-only, no server dependency.
- [ ] Decide whether the SV/CF-defaults-to-BTC behavior is worth keeping; it's a nice touch
      but a small edge case (two countries) for the added branching.

### Polish / lower priority

- [ ] None specific to this diff beyond the must-haves above — the bulk of what looked like
      "new" UX in the raw diff (delivery, passphrase, email, share, QR, downloads) is already
      shipped, so there's no polish backlog from this import beyond the fiat/BTC toggle
      scoping above.

---

## 5. Does the design include send-mechanism UX now?

**Yes.** As of this v2 export, `GiftBitcoinApp.dc.html` fully models the send mechanism
shipped in PR #14 — delivery choice, generated passphrase, `/api/send`-style email flow
(Turnstile slot included), share tier (Web Share/WhatsApp/Messages), gift-link QR, and the
share-card/watch-only downloads. The design doc is no longer "pre-email" — it's a close
mirror of the shipped implementation, plus one unshipped addition (the fiat/BTC amount
toggle, §2/§4).

---

## 6. Screen inventory

Unchanged from v1 — see [v1 §2](2026-07-12-giftbitcoin-design-handoff.md#2-screens) for the
full per-screen prose (Home, Create C1/C3/C4, Claim R0-R4, Help, Recover). Only the Create
C1 (amount + delivery), C3 (pay), and C4 (ready) screens changed in this update, per §2 above.

---

## 7. Assets

Same four files as v1, `GiftBitcoinApp.dc.html` re-exported (content updated), the other
three byte-identical to their v1 versions:

- [`GiftBitcoin-Design.dc.html`](assets/GiftBitcoin-Design.dc.html) — brand/prototype canvas, unchanged.
- [`GiftBitcoinApp.dc.html`](assets/GiftBitcoinApp.dc.html) — updated: amount/denom toggle, delivery/passphrase/email/share rework (see §2).
- [`logo-mark-header.svg`](assets/logo-mark-header.svg) — unchanged.
- [`logo-mark-hero.svg`](assets/logo-mark-hero.svg) — unchanged.
