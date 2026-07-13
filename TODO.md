# Gift Bitcoin — TODO

**Brand:** [giftbitcoin.app](https://giftbitcoin.app) — [docs/BRAND.md](./docs/BRAND.md)

Source of truth for backlog items.

- Spec: [SPEC.md](./SPEC.md) v0.3.0
- Competitive: [docs/COMPETITIVE-LANDSCAPE.md](./docs/COMPETITIVE-LANDSCAPE.md)  
- Wallets + buy BTC: [docs/WALLETS-AND-ONRAMP-2026.md](./docs/WALLETS-AND-ONRAMP-2026.md)

---

## Session status — 2026-07-12 (send-mechanism implementation)

**Done:** send mechanism implemented (**PR #14**, squash `41e7c40`): SPEC v0.3.0 amendments,
generated 4-word EFF passphrases, delivery choice + share tier (Web Share/WhatsApp/SMS),
3-segment QR fragment, claim normalization + retry-raw back-compat, /api/send Worker
(Turnstile + address recompute + esplora fail-closed), QR rendering (funding + claim link).
Issue **#13** closed. Coolify redeployed on main; Worker live on `giftbitcoin.app/api/send`.
Real Turnstile widget `giftbitcoin-send` created; site key in `src/config/send.ts`, secret
via `wrangler secret put TURNSTILE_SECRET`.

**Follow-ups:**
- [x] **Mail transport** — AWS SES (not CF Email Sending). From `gifts@greerso.com` until
      giftbitcoin.app is optional-verified in SES.
- [~] Live smoke: **gate path live 2026-07-13** — GET→405, 3-seg→400 `bad_link`,
      missing Turnstile→400, home 200. **Still open:** fund testnet4 gift in browser,
      send via UI to external inbox (Turnstile + funding + SES e2e).
- [ ] Manual QA: 3-segment QR density scan on real phone cameras (~1.6–1.9 KB → 137×145
      modules at `ecc:'low'`).
- [x] Design v2 handoff + fiat/BTC denom toggle + home/claim copy alignment (see
      `docs/superpowers/designs/`). Logo concepts B/C remain brand archive only (not shipped).
- [x] **SES-only IAM** — user `giftbitcoin-send-ses` (policy `GiftBitcoinSendSesOnly`:
      `ses:SendEmail`/`ses:SendRawEmail` on `greerso.com` + `gifts@greerso.com` only).
      Worker secrets rotated off broad `awscli` keys; CLI SES smoke MessageId ok.

---

## Session status — 2026-07-11 (design implementation + crypto hardening)

**Branch:** `feature/giftbitcoin-design`

**Done this session:**
- Critical-assessment of the crypto core + deploy → fixed. Biggest: expiry tapleaf
  was `<T> CSV DROP …` but the emitted descriptor is `and_v(v:older(T),pk(R))` =
  `<T> CSV VERIFY …` (different address → broken descriptor recovery). Now VERIFY;
  golden vector regenerated + verified against rust-miniscript.
- base64url secrets (SPEC §5.3/§5.4), strict hex validation, 32-byte guards, NFC
  passphrase, on-curve R validation, verifyGiftPackage integrity check.
- Strict CSP (SvelteKit hash mode), nginx header-inheritance fix, self-hosted fonts.
- Full GiftBitcoin design implemented: home / create / claim / help / recover, four
  card designs, live USD pricing, real testnet address generation, SPEC-conformant
  packages (share_card / full_backup / watch_only), real Esplora fund-watch, real
  claim-path build+broadcast. Tests 10 → 36.

**Deferred (tracked, not done):**
- **Real claim broadcast** is implemented but only unit-tested — no live testnet4
  faucet e2e this session. Needs an on-faucet end-to-end run before mainnet talk.
- **Refund / expiry broadcast** (custom CSV leaf needs a manual witness — scure
  can't auto-finalize it): recover page is status-check + honest note only. **v1.1 (SPEC §14.4).**
- **Static offline claim HTML** — not built. **v1.1 (SPEC §14.4).**
- **Project tip is unpayable** — `PROJECT_TIP_ADDRESS_TESTNET` is empty; tip is
  suggested-only. Set the release-config address or hide the control.
- **User-selectable indexer UI** — esplora base is localStorage-overridable in code
  but there's no settings screen; custom hosts also need a CSP connect-src entry.
- **Docker base images unpinned** + no reproducible-build doc (SPEC §13).

### Brand / domain / Coolify

- [x] **B1a** — Register **giftbitcoin.app**
- [x] **B1c** — Coolify app on Thinkstation (uuid `jdhe9b54fe70iddhxr351sml`, running:healthy)
- [x] **B1d** — Interim HTTPS: https://giftbitcoin.greerso.com
- [x] **B1e** — CF Tunnel hostnames `giftbitcoin.app` + `www` → `http://localhost:80` (magnolia-thinkstation)
- [x] **B1b** — DNS CNAMEs `@`/`www` → tunnel (proxied) exist; **redirect loop fixed 2026-07-12** by switching the tunnel ingress from `http://localhost:80` → `https://localhost:443` + `originServerName` (strict TLS, mirrors magnolia). `giftbitcoin.app` + `www` now live (200). See [docs/DEPLOY.md](./docs/DEPLOY.md).
- [x] **B2** — Claim links use `window.location.origin`, so on `giftbitcoin.app` they are `https://giftbitcoin.app/c#…` automatically.
- [x] **B3** — Optional: email link previews / OG (no secrets in unfurls) — og/twitter summary card using `/icons/icon-512.png` only
- [x] **B4** — **Installable app (PWA)** — Issue **#17**. Manifest + icons + optional Chromium install banner (`InstallPrompt`). No SW secret caching.
- [ ] **B5** — Auto-deploy webhook main → Coolify (optional)

---

## Competitive watch list

Track peers and UX references. Re-verify custody before marketing claims. Details in the landscape doc.

### High priority (UX / positioning)

- [ ] **W1** — [Blitz Gifts](https://blitzwalletapp.com/) — claim link + bulk gifts + reclaim expired; Spark L2 self-custody wallet ([GitHub](https://github.com/BlitzWallet/BlitzWallet)). Study share/claim/reclaim UX only.
- [ ] **W2** — [LNbits LNURL-withdraw](https://github.com/lnbits/withdraw) + BTCPay voucher plugins — print/QR gift voucher UX; host holds LN balance until withdraw.
- [ ] **W3** — [Lightsats](https://lightsats.com/) — tip/gift + reclaim if unclaimed; service holds until claim. Onboarding copy reference.
- [ ] **W4** — Paper-wallet generators (bitaddress-style / DIY seed gifts) — shared browser-keygen threat model; no scripted refund.

### Protocol-adjacent (different trust)

- [ ] **W5** — [Cashu](https://cashu.space/) + [CashuCards](https://github.com/Marc26z/CashuCards) — bearer ecash gifts; mint holds BTC. Privacy UX lessons only.
- [ ] **W6** — [Agicash](https://agi.cash/) — merchant BTC gift cards (Cashu/Spark); not peer L1 vaults.
- [ ] **W7** — [Azteco](https://azte.co/) — voucher → redeem to any wallet; issuer intermediary until redeem.

### Lower priority / contrast

- [ ] **W8** — Bitrefill / CryptoVoucher-style commerce gift cards — email “card” UX only; custodial commerce.
- [ ] **W9** — Monaco (EVM gift-card contracts) — on-chain claim analogue on wrong chain.
- [ ] **W10** — TokenBox / GiftBox-style web demos — verify before citing; often unproven.

### Suggested follow-ups from research

- [ ] **R1** — UX pass: map Blitz/LNbits create → share → claim → reclaim onto SPEC flows (no rail copy)
- [ ] **R2** — Marketing copy: claim “this stack,” not “first Bitcoin gift” (paper wallets exist)
- [ ] **R3** — Re-audit competitive list before mainnet (custody claims drift)
- [ ] **R4** — Optional deep-dive: Blitz/Spark gift reclaim mechanism vs our CSV race (doc note only)
- [ ] **R5** — Optional deep-dive: Cashu token export format vs our share_card (interop is out of scope v1)

### Decentralized delivery (from docs/DEMAND-AND-DECENTRALIZATION.md)

- [ ] **D1** — Reproducible static build; publish release checksums + IPFS CID for each version
- [ ] **D2** — Pin app to IPFS (and document gateway + local IPFS access)
- [ ] **D3** — Optional ENS contenthash and/or DNSLink for stable name → CID
- [ ] **D4** — Public mirror list (HTTPS + IPFS) in README; never single-origin-only recovery story
- [ ] **D5** — Default docs: user-selectable indexer; “bring your own Esplora/Electrum” first-class
- [ ] **D6** — Success metric note: completed non-custodial gifts + verifiable releases (not GMV vanity)

### Monetization (from docs/MONETIZATION.md) — must not add custody

- [ ] **M1** — Create UX: default **3%** project tip, editable (% and sats), allow **0**; separate from gift vault (SPEC §8.1)
- [ ] **M2** — Sponsors / donate page (GitHub Sponsors, on-chain, LN); tip receive addresses in release config
- [ ] **M3** — Define 1–2 paid service offers (e.g. event gifting kit, white-label deploy help)
- [ ] **M4** — Keep `donate_project` non-default; track as secondary only
- [ ] **M5** — Explicit non-goals in README: no mandatory protocol fee in script, no custodial balances, tip never required to gift

---

## Improvements (from SPEC §22)

Not blocking v1. Each needs an ADR if it changes packages or scripts.

- [ ] **I1** — Per-gift donate `R` from project xpub (`…/0/i`) — reduces on-chain clustering of donate gifts *(low)*
- [ ] **I2** — MuSig/multisig project cold key — reduces single-key donate compromise *(med)*
- [ ] **I3** — Optional 2-of-2 claim path (recipient pre-registers) — rare; breaks “unknown recipient” default *(high)*
- [ ] **I4** — CTV/covenant expiry pay-to-fixed-address — true “must go to address X” custom policy *(high + softfork)*
- [ ] **I5** — HWI / hardware signing for refund — safer large-value sender recovery *(med)*
- [ ] **I6** — PayJoin or equal-output claim — mild privacy for claim tx shape *(med)*
- [ ] **I7** — Tor-only indexer preset — one-click privacy for chain queries *(low)*
- [ ] **I8** — Compact binary share QR (CBOR/protobuf) — easier print/scan than fat JSON *(low)*
- [ ] **I9** — Watchtower-style sender notify (optional, privacy-preserving) — “gift claimed” without custody *(high)*
- [ ] **I10** — Mainnet release checklist — ops, donate multisig, feerate floors, legal-by-design review *(med)*
- [ ] **I11** — Deterministic test vectors file (`vectors/v1.json`) — cross-impl compatibility *(low)*
- [ ] **I12** — Claim decoy / steganographic share — reduce shoulder-surf of QR “cash” *(low)*
- [ ] **I13** — Fee sponsorship via separate input — sender prepays claim fee *(high)*
- [ ] **I14** — Signet profile — public demo without testnet4 faucet pain *(low)*
- [ ] **I15** — Locale / i18n — normie UX at scale *(med)*

---

## Claim UX (from docs/CLAIM-UX.md / SPEC §7.2)

- [ ] **C1** — Destination chooser: Recommended + all options (self-custody, LN, exchange, paste, help)
- [ ] **C2** — `destinations.json` per docs/WALLETS-AND-ONRAMP-2026: Phoenix (primary mobile), Muun, BlueWallet, Sparrow (desktop); Coinbase/Gemini/Kraken/Cash App/Strike/Other
- [ ] **C3** — Address paste + network validation + plain-language errors
- [ ] **C4** — Review: fee, net, destination type, custodial disclosure, self-custody nudge if exchange
- [ ] **C5** — Success: txid / LN status + exchange wait + claim-once + backup reminder if self-custody
- [ ] **C6** — Help-me-choose (device + preference → ranked recs)
- [ ] **C7** — Soft warn when net may be below exchange minimums
- [ ] **C8** — Testnet labeling (exchanges mainnet-oriented; testnet wallet path for e2e)
- [ ] **C9** — Mobile-first claim flow QA (≤ 3 min guided claim)
- [ ] **C10** — Device-aware recommendation (phone vs desktop + continue-on-phone QR in-browser)
- [ ] **C11** — Encourage self-custody copy without blocking other paths
- [ ] **C12** — Lightning claim UI (invoice/LNURL) when §9 flag on; amount-based prefer LN
- [ ] **C13** — Explicit non-goals: no exchange OAuth/API keys; no third-party QR APIs for secrets
- [ ] **C14** — Deep links / store buttons for featured wallets only
- [ ] **C15** — Small-amount threshold config (`smallAmountSats`) for LN vs on-chain recommend
- [ ] **C16** — Desktop “continue on phone” QR from `location.href` client-side only
- [ ] **C17** — Align featured wallets with 2026 research doc; annual refresh checklist
- [ ] **C18** — Never label Wallet of Satoshi / custodial apps as “self-custody”

## Buy BTC / on-ramp (docs/WALLETS-AND-ONRAMP-2026.md)

- [ ] **O1** — Create funding chooser: already have BTC | buy now | guided exchange | LN→chain
- [ ] **O2** — Integrate one embed on-ramp (Coinbase Onramp **or** MoonPay/Ramp) → destination = gift address
- [ ] **O3** — Guided paths: Strike, Kraken, Gemini, Coinbase app (buy then send to QR)
- [ ] **O4** — Amount prefill: gift + tip + fee buffer; underpay handling
- [ ] **O5** — Partner session backend if required (no gift secrets/keys)
- [ ] **O6** — Geo/feature flags + disclosure copy (KYC is partner’s)
- [ ] **O7** — Testnet: stub buy UI; faucet path for real e2e

## v1 implementation (from SPEC §14)

- [ ] Scaffold app (client-only keygen + signing)
- [ ] Taproot descriptor / NUMS golden vector (Appendix A)
- [ ] Create flow + fund watch + conf gates + default 3% editable tip + funding chooser
- [ ] Package exports: share_card, sender_full_backup, sender_watch_only
- [ ] Claim on-chain (multi-UTXO) **with C1–C9**
- [ ] Expiry recovery (`refund_self`)
- [ ] `donate_project` + `custom` policy wiring
- [ ] Optional passphrase (Argon2id)
- [ ] Static offline claim HTML (simplified destination paste still required)
- [ ] testnet4 indexer integration (pluggable)
- [ ] LN interfaces behind default-off flag (no success requirement)
- [ ] §14.3 success criteria green

---

## Open PRs / issues

- [x] **#5** — Critical-assessment fixes (key-loss guard, poll race, redeem re-confirmation, recover copy, `g1.` claim-link spec) — merged via **#6** (`0b971e5`, 2026-07-12)

### Remaining review findings (not in #5)

- [x] `[user decision → approved 2026-07-12]` SPEC amendment: §5.5 offline-claim kit, §14.1 refund signing + donate/custom policies, §10.4 indexer override moved to explicit **v1.1 milestone** (SPEC §14.4, v0.2.6) — merged via **#7** (`c84edeb`)
- [x] Improvements from 2026-07-12 full-codebase review (all 8: per-type dust floor, finalize leaf-order doc, corrupt `g1.` link message, §8.1 tip formula, `ACTIVE_NETWORK` real plumbing, wire-form create self-check, secrets-never-sent test, Esplora fee-estimates fallback) — issue **#8**, merged via **#9** (`9cd6691`, 2026-07-12); tests 36 → 44
