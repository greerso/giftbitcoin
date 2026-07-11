# Gift Bitcoin — TODO

**Brand:** [giftbitcoin.app](https://giftbitcoin.app) — [docs/BRAND.md](./docs/BRAND.md)

Source of truth for backlog items.

- Spec: [SPEC.md](./SPEC.md) v0.2.4  
- Competitive: [docs/COMPETITIVE-LANDSCAPE.md](./docs/COMPETITIVE-LANDSCAPE.md)  
- Wallets + buy BTC: [docs/WALLETS-AND-ONRAMP-2026.md](./docs/WALLETS-AND-ONRAMP-2026.md)

### Brand / domain / Coolify

- [x] **B1a** — Register **giftbitcoin.app**
- [x] **B1c** — Coolify app on Thinkstation (uuid `jdhe9b54fe70iddhxr351sml`, running:healthy)
- [x] **B1d** — Interim HTTPS: https://giftbitcoin.greerso.com
- [x] **B1e** — CF Tunnel hostnames `giftbitcoin.app` + `www` → `http://localhost:80` (magnolia-thinkstation)
- [ ] **B1b** — Cloudflare DNS CNAMEs `@`/`www` → `45ab2a45-9512-46f8-bae4-0c882e02df73.cfargotunnel.com` (proxied; dashboard — API token lacks DNS write on this zone)
- [ ] **B2** — Production claim URL base `https://giftbitcoin.app/c#…` in package templates (after DNS)
- [ ] **B3** — Optional: email link previews / OG (no secrets in unfurls)
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

_(none yet)_
