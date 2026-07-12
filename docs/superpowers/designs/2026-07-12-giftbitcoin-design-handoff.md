# GiftBitcoin — Claude Design Handoff

**Source project:** "Giftoin Bitcoin e-giftcards" (`54d56c40-9ac0-4461-b83e-b81d2fe5324e`)
**Editor link:** https://claude.ai/design/p/54d56c40-9ac0-4461-b83e-b81d2fe5324e
**Files:** `GiftBitcoin Design.dc.html` (brand + prototype canvas), `GiftBitcoinApp.dc.html` (the actual clickable component, imported at mobile 390×780 and desktop 1100×760)
**Exported to repo:** `docs/superpowers/designs/assets/` (see [Assets](#assets))
**Compared against:** the currently shipped SvelteKit app (`src/routes/`, `src/lib/`) as of commit `2b5f4cf`

No auth was required — the project was reachable directly via the `claude_design` MCP tools.

---

## 1. Design tokens

### Color

| Token | Hex | Use |
|---|---|---|
| Amber (primary) | `#C97210` | Primary buttons, gift card, brand mark |
| Amber hover | `#A85F0D` | Button/link hover, links |
| Amber ink (on tint) | `#8A5A10` | Text on amber-tinted backgrounds |
| Amber tint bg | `#F9EFE1` / `#F3EBDB` | Badge/pill backgrounds, selected chip fill |
| Ink | `#23272E` | Primary text |
| Warm white (surface) | `#FAF8F4` | Page/card background |
| Canvas | `#F0EDE6` | Design-doc-mode outer canvas only |
| Muted text | `#6E7480` / `#4B5563` | Body copy, secondary text |
| Disabled/label tan | `#B4A98F` | Uppercase eyebrow labels, disabled text |
| Borders | `#EAE3D4` / `#E3DCCE` / `#D8D0C0` / `#EEE7D9` | Card/input/divider borders, warm greys |
| Success | `#2F7A52` | Confirmed/success states |
| Success tint bg | `#E9F2EC` | Success badge background |
| Error | `#B4483C` | Address/validation errors |
| Testnet strip | bg `#EFE9DD`, text `#7A6E55` | Top-of-page test-mode banner |
| Disabled button | `#DCC9A8` | Disabled primary button fill |

Amber is used sparingly by design intent: primary buttons, the gift card face, and the mark. Everything else is ink on warm white.

### Type

| Role | Font | Notes |
|---|---|---|
| Headlines (h1/h2, logo wordmark) | **Bricolage Grotesque** (500/600/700, variable optical size 12–96) | `letter-spacing:-0.015em` to `-0.02em` |
| Body / UI / buttons | **Instrument Sans** (400/500/600/700) | Warm, legible at small sizes |
| Addresses / tx ids only | `ui-monospace, Menlo, monospace` | Never used for prose |

Scale: h1 32px/600, h2 25px/600, body 15–16px, secondary 13–14px, micro-labels 10–12px uppercase with `letter-spacing:0.05–0.09em`.

### Shape & spacing

- Radii: inputs/buttons 10–12px, cards 14px, feature cards (pay/review/big gift card) 16–18px, pills `999px`, small icon tiles 6–9px.
- Primary button: full-width, 15px padding, 12px radius, weight 600, white on `#C97210` (hover `#A85F0D`); disabled → `#DCC9A8`.
- Secondary button: white fill, `1.5px solid #D8D0C0`, hover bg `#F6F1E6`.
- Chips (amount/speed/tip presets): unselected `1px solid #E3DCCE` on white; selected `2px solid #C97210`, bg `#F9EFE1`, text `#8A5A10`.
- Content column max-width 560px, page gutter 20px.
- Gift card: `aspect-ratio:1.586/1` (credit-card ratio), 18px radius, gradient face per design.
- Mobile prototype frame 390×780, desktop 1100×760.

### Gift card designs (4)

| Design | Label copy | Gradient | Shadow | Motif |
|---|---|---|---|---|
| Classic | "Bitcoin gift card" | `#D98A2B → #B8650E` | `rgba(201,114,16,.28)` | Diagonal stripe overlay |
| Birthday | "Happy birthday" | `#C65A45 → #A8402E` | `rgba(166,64,46,.28)` | Dotted confetti overlay |
| Midnight | "A gift for you" | `#2E3947 → #1D2430` | `rgba(29,36,48,.35)` | Vertical amber accent stripe |
| Holiday | "Season's greetings" | `#3A7A5B → #27573F` | `rgba(39,87,63,.3)` | Circular highlight overlay |

These four match the shipped `CARD_DESIGNS` in `src/lib/giftcards.ts` exactly (id, label, colors).

### Logo concepts (brand exploration, turn 1a)

Three unused-vs-shipped concepts sit side by side in the design doc:

- **A — card tile**: amber rounded-rect with ₿ mark. **This is the one shipped** (header + hero SVG in the current app).
- **B — ribbon card**: dark navy tile with a vertical amber ribbon stripe. Not shipped.
- **C — seal**: circular amber-bordered ₿ medallion. Not shipped.

B and C are preserved in the design file as alternates for a future rebrand, not dead options to delete.

---

## 2. Screens

All screens live in one component (`GiftBitcoinApp.dc.html`), driven by `state.screen`. Chrome (testnet strip, header with back button + brand + desktop Help/Recover links, footer bearer-instrument notice) wraps every screen.

### Home (`isHome`)
Hero SVG gift card (92×60, drop-shadow `rgba(201,114,16,.28)`) → eyebrow pill "**E-gift card · real bitcoin**" → H1 "**The e-gift card that's real bitcoin.**" → lede "A digital gift card you send by link, with nothing to mail. Pick a design, choose an amount in dollars, and share it. They redeem it to a wallet they control. No accounts, and we never touch the money." → primary "Create a gift card" / secondary "Redeem a gift card" → three bullet points (Non-custodial / No account needed / Redeem to your own wallet — "We'll help you set one up, or use an exchange like Coinbase if you'd rather").

### Create — C1 "Choose a card"
Big card preview (live-bound to design/amount/name) → 4 design thumbnails → amount presets `$25/$50/$100/$250` + custom input, helper text "They'll receive real bitcoin, about **{btc} BTC** at today's rate." → "Who's it for?" (To/From inputs + optional message textarea) → collapsible **Advanced options**: network fee speed (Economy 2 sat/vB ~2–6h / Standard 6 sat/vB ~30min / Priority 15 sat/vB ~10min), project tip (0/1/3/5%, "keeps giftbitcoin free and running"), expiry (30/90/180 days, "you can reclaim your bitcoin after this long"), passphrase toggle ("Share it separately, like the PIN on a gift card") → primary "Continue to payment" (disabled until amount valid).

### Create — C3 "Pay for your gift card"
Total + BTC-to-send copy → address card (QR placeholder + mono address + "Copy address") → "How will you pay?" options (have bitcoin / need to buy / walk-me-through with Coinbase/Kraken) → idle: "I've sent it"; pending: amber pulse-dot banner "Waiting for 1 confirmation… usually about 10 minutes. You can leave this page, and your gift card will be ready when you return."

### Create — C4 "Your gift card is ready"
Green check badge → confirmation copy → final card preview with message/from-line → warning box "**This link is money.** Anyone who has it can redeem the bitcoin, so share it privately, like cash." → "Download backup" / "Copy gift link" → note that the backup contains the gift link (+ passphrase caveat) and is unrecoverable if lost → "Done → back to start".

### Claim — R0 status
Recipient-facing card preview (amount, italic message + from-line) → green "Ready to redeem" pill → H2 "Someone sent you bitcoin" → reassurance copy ("New to bitcoin? That's OK... about two minutes.") → "Redeem your bitcoin".

### Claim — R1 "Where should we send it?"
Two labeled groups: **You control it** (Recommended card — Phoenix on mobile / Sparrow on desktop — plus "I already have a wallet" / paste), **Held for you** (exchange account: Coinbase/Kraken/Gemini), plus "Help me choose" → Help screen.

### Claim — R2 guided setup + paste
Per-destination numbered guide (Phoenix / Sparrow / Exchange / generic paste — 3 steps each, verbatim strings match the shipped `GUIDES` object) → address textarea (`bc1q…`/`tb1q…` placeholder) with inline validation error → "Continue".

### Claim — R3 "Review"
Line-item table (gift card amount+BTC / network fee by speed name / "You receive" net in green / truncated destination address) → conditional exchange-education note → fine print ("Redeeming sends the full amount in one go... can't be used again") → "Redeem my bitcoin" (loading label "Sending…").

### Claim — R4 success
Green check → "It's on the way" → net amount sent copy → transaction link card → conditional exchange-delay note ("10–60 minutes... normal") → redeemed/link-empty notice → "Done".

### Help
FAQ cards: "What is this?", "Which option should I pick?" (recommends Phoenix, mentions pasting an address, names exchanges as simplest-but-custodial fallback), "Is this safe?", "What if I lose the link?" → "Back to redeeming".

### Recover
"Recover an unredeemed gift" → paste gift link or backup file → "Check status" → result banner (mock always returns "active until Oct 9, 2026") → collapsible **Advanced** note: "The gift key is in your link's fragment (#…), never sent to our servers. You can sweep the address directly with any wallet that imports WIF keys."

---

## 3. Deltas vs the shipped SvelteKit app

The design doc and the shipped app are close — the design tokens (color/type/radii) and the four card designs already match exactly, and PR history shows this design was already the basis for the current build. The differences below are what's left to reconcile, not a rewrite.

### Copy drift (same idea, different wording — pick one and align)

| Element | Design mock | Shipped app |
|---|---|---|
| Home H1 | "The **e-gift card** that's real bitcoin." | "The **gift card** that's real bitcoin." |
| Home lede | "...Pick a **design**... share **it**. They redeem it to **a wallet they control**." | "...Pick a **card**... share **a link**. They redeem it to **any wallet or exchange**." |
| Home bullet 3 | "**Redeem to your own wallet.** We'll help you set one up, or use an exchange like Coinbase if you'd rather." | "**Redeem anywhere.** Phoenix, Coinbase, Kraken, or any bitcoin address." |
| Home eyebrow badge | "E-gift card · real bitcoin" pill above H1 | Not present |
| Testnet strip | "Test mode**:** bitcoin on this site has no real value" | "Test mode **—** bitcoin on this site has no real value" |
| Claim R1, paste option | "I already have a wallet" / "Paste an address from any wallet you control" | "I have a bitcoin address" / "Paste any address from any wallet" |
| Tip framing | Implies the tip is simply part of the total | App explicitly discloses: "Currently {pct}% ({usd}). Recorded in your backup for the open-source project — tip collection isn't wired up in this testnet build, so you only fund the gift itself." (known, intentional gap) |
| Header/hero mark size | Header 38×25, hero 92×60 | Header 26×20, hero 72×50 |

### Screens/states present in the app but not modeled in the static mock

The mock is a clickable prototype with hardcoded demo data (fixed BTC price, fake address, fake txid, `setTimeout` instead of real chain polling) — it doesn't need every real-world state, but these are the gaps if the mock is kept as a living reference:

- **`loading` and `nolink` claim screens** — entry states for "still fetching" and "no/broken gift fragment in the URL," both app-only.
- **R0 badge states** — app models 5 (`Ready to redeem` / `Funds confirming…` / `Not funded yet` / `Checking…` / retry-on-error); mock only shows the one "Ready to redeem" state.
- **R3 review warnings** — app adds `amountsChanged` (balance/fee shifted while reviewing) and underfunded-gift banners; mock's review table has no equivalent.
- **Mainnet-address rejection copy** ("That looks like a mainnet address. This is a testnet gift...") — app-only; mock's validator only has the generic "doesn't look like a bitcoin address" message.
- **Corrupt/short-link classification** on claim entry — app-only, not in the mock's happy-path prototype.
- **C4 extra exports** — app adds "Share card file" and "Watch-only" links beyond the mock's Download backup / Copy link.
- **Regenerate-keys confirmation** and **unsaved-backup nav guards** (`beforeNavigate`/`beforeunload` on the create page, back-button lock while a claim broadcast is in flight) — these are real safety mechanisms in the app with no equivalent affordance shown in the mock.
- **Reorg/race handling** before claim broadcast (re-fetch UTXOs, reject if amounts moved unfavorably) — invisible in a static mock, but the copy for it (`amountsChanged` warning above) is a real screen state worth adding.

### Unused design assets

Logo concepts B (ribbon) and C (seal) are fully worked out in the design doc but not wired into the app anywhere — they're future-rebrand options, not orphaned work.

---

## 4. Implementation checklist

- [ ] Reconcile home H1/lede/bullet-3 copy — decide which wording is canonical (app copy reads like a later refinement; confirm before back-porting either direction).
- [ ] Decide whether to add the "E-gift card · real bitcoin" eyebrow badge to the shipped home page, or drop it from the design doc as superseded.
- [ ] Normalize the testnet strip punctuation (colon vs. em dash) between the design doc and the app.
- [ ] Align Claim R1's "paste an address" option copy between mock and app.
- [ ] Decide the fate of logo concepts B and C — archive in the design doc with a note, or reserve for a themeable rebrand.
- [ ] If/when tip collection is actually wired on-chain, update the design mock's tip copy to stop implying it's already collected (or, until then, leave the app's honest disclosure as the source of truth).
- [ ] If the design doc is going to stay a living reference (not just a one-off brand exploration), backfill the missing states into `GiftBitcoinApp.dc.html`: `loading`/`nolink` claim screens, R0 badge variants, R3 `amountsChanged`/underfunded banners, mainnet-address rejection copy, and the C4 watch-only/share-card export links.
- [ ] Pick one header/hero mark scale (26×20/72×50 vs 38×25/92×60) and record it as the token; the other is presumably a copy artifact from resizing during design iteration.

---

## 5. Assets

Exported into `docs/superpowers/designs/assets/`:

- [`GiftBitcoin-Design.dc.html`](assets/GiftBitcoin-Design.dc.html) — the brand/prototype canvas (turn 1: logo concepts, color, type, and the `<dc-import>` wiring for mobile/desktop).
- [`GiftBitcoinApp.dc.html`](assets/GiftBitcoinApp.dc.html) — the full clickable component: every screen's markup plus the `Component` class (state machine, fee/tip/BTC math, address regex, wallet guides). This is the most useful file to diff copy strings against.
- [`logo-mark-header.svg`](assets/logo-mark-header.svg) — logo concept A at header scale (38×25 in the mock; app ships it at 26×20).
- [`logo-mark-hero.svg`](assets/logo-mark-hero.svg) — logo concept A at hero scale (92×60 in the mock; app ships it at 72×50).

These `.dc.html` files use Claude Design's custom templating (`<sc-if>`, `<sc-for>`, `{{ }}` bindings, `<x-dc>`/`support.js` runtime) — they aren't standalone-renderable HTML outside a Design Components host, but they're readable as source and safe to grep for exact copy strings. `support.js` (the runtime bundle) was not copied — it's a large generic engine file, not project-specific content.

Logo concepts B (ribbon) and C (seal) are inline markup inside `GiftBitcoin-Design.dc.html` (not separately exported as SVGs) since neither is shipped or immediately actionable.
