# Competitive landscape — Bitcoin e-giftcards (non-custodial focus)

**Date researched:** 2026-07-11  
**Purpose:** Compare existing products to BTC Giftcard SPEC v0.2 before implementation.  
**Filter:** Prefer decentralized / non-custodial designs; note custodial products only for UX contrast.

Related: [SPEC.md](../SPEC.md) · tracking in [TODO.md](../TODO.md).

---

## 1. Executive summary

**Nothing found matches the full SPEC design:**

- On-chain **Taproot** vault (`pk(C)` claim **or** `older(T) ∧ pk(R)` expiry)  
- Claim via **share package / link** without knowing recipient address  
- **Website process keyless**  
- **Offline-recoverable** if the site dies  
- Sender-chosen **refund / donate / custom** expiry  

Related products exist in three clusters:

1. **Bearer keys** (paper wallets) — closest trust model, weak UX / no scripted refund  
2. **LN / L2 gift links** (LNURLw, Lightsats, Blitz Gifts) — closest UX, different custody or rail  
3. **Ecash tokens** (Cashu / CashuCards) — bearer UX, **mint** holds BTC  

**Differentiation (honest claim if SPEC is shipped):** pure L1 Taproot gift UTXOs, on-chain timeout path, site-optional recovery, no accounts and no website spend keys.

---

## 2. Our reference architecture (SPEC v0.2)

| Property | BTC Giftcard |
|----------|----------------|
| Vault | On-chain Taproot UTXO |
| Claim | Bearer claim key from package/URL (± passphrase KDF) |
| Expiry | BIP68 CSV + key `R` (refund / project donate / custom) |
| Operator (website) | Never holds claim or refund keys |
| LN | Optional atomic swaps only; not the vault |
| Offline | Full package + offline claim HTML |

---

## 3. Non-custodial / bearer-adjacent (priority watch)

### 3.1 Paper wallets / redeemable private keys

| | |
|--|--|
| **Examples** | bitaddress-style generators, DIY seed gifts, physical “Casascius-style” coins, classic paper-wallet gift guides |
| **Model** | Generate keypair → fund address → give WIF/seed/QR; recipient sweeps |
| **Like us** | Recipient address unknown at fund; no platform balance; pure Bitcoin |
| **Unlike us** | No beautiful claim app; **no on-chain refund timer**; sender copy of key = theft; usually legacy/segwit single-key, not Taproot claim/refund tree |
| **Lesson** | Browser keygen threat model (compromised JS) is shared; offline package + reproducible builds matter |

### 3.2 Cashu tokens & CashuCards

| | |
|--|--|
| **Examples** | [Cashu](https://cashu.space/), [CashuCards](https://github.com/Marc26z/CashuCards), [cashu-cards.shakespeare.wtf](https://cashu-cards.shakespeare.wtf/), Agicash ecosystem cards |
| **Model** | Ecash tokens as bearer gifts / greeting cards; redeem to Lightning/on-chain via a **mint** |
| **Like us** | Bearer instrument; gift without recipient address; open protocols |
| **Unlike us** | **Mint custody of BTC** until redeem (federated mint trust ≠ keyless L1 vault); no Taproot CSV refund-to-sender script on the gift UTXO |
| **Lesson** | Strong privacy/UX for **small** amounts; do not market as equivalent decentralization |

### 3.3 Blitz Gifts (Blitz Wallet)

| | |
|--|--|
| **Examples** | [blitzwalletapp.com](https://blitzwalletapp.com/), [BlitzWallet/BlitzWallet](https://github.com/BlitzWallet/BlitzWallet) |
| **Model** | Self-custodial wallet; **shareable gift claim links**; bulk gifts; **reclaim expired** gifts; Spark L2 + Lightning |
| **Like us** | Modern gift-link UX; self-custody framing; reclaim unclaimed; open source |
| **Unlike us** | Rail is **Spark L2** (not SPEC Taproot script); reclaim is product/L2 behavior, not BIP68 dual-path L1; recipient often in-app |
| **Lesson** | Study create → share link → claim → reclaim flows for UX; do not copy rail/custody assumptions |

### 3.4 TokenBox / “GiftBox” style demos

| | |
|--|--|
| **Examples** | Web demos marketing “non-custodial crypto gift boxes” (e.g. Vercel prototypes) |
| **Model** | Web claim UX for multi-crypto gifts |
| **Caution** | Often unproven, multi-chain, audit/status unclear — treat as **inspiration only**, not a protocol peer |

---

## 4. Gift links with host-held funds until claim

These are important **UX** references but **fail** the “website/process cannot move funds / vault is user script” bar unless the user self-hosts and accepts **themselves** as custodian of a pool.

### 4.1 LNURL-withdraw vouchers

| | |
|--|--|
| **Examples** | [LNbits withdraw](https://github.com/lnbits/withdraw), BTCPay LNURL-withdraw voucher plugins, various LN faucets/gifts |
| **Model** | QR/link encodes right to **pull** LN payment from a node’s balance |
| **Custody** | Sats sit in **operator or self-hosted LN node** until withdraw |
| **Lesson** | Excellent print/QR gift UX; self-host ≠ protocol non-custody of a gift UTXO |

### 4.2 Lightsats

| | |
|--|--|
| **Examples** | [lightsats.com](https://lightsats.com/) |
| **Model** | Tip/gift sats for onboarding; reclaim if not withdrawn in time |
| **Custody** | **Service holds** until claim/reclaim |
| **Lesson** | Reclaim narrative and no-coiners onboarding copy |

### 4.3 Azteco vouchers

| | |
|--|--|
| **Examples** | [azte.co](https://azte.co/) |
| **Model** | Buy voucher code → redeem to **any** wallet (LN or on-chain options) |
| **Custody** | Issuer intermediary until redeem; ends non-custodial **after** redeem |
| **Lesson** | Normie “gift card code” mental model; not L1 dual-path script |

---

## 5. Commerce / brand gift cards (contrast only)

| Examples | Model | Relevance |
|----------|--------|-----------|
| Bitrefill, CryptoVoucher, Cryptorefills, Fold-style cards | Pay crypto/fiat → brand gift card or store credit | **Not** decentralized BTC gift UTXOs; UX for “send a card by email” only |
| Agicash merchant gift cards | Closed-loop merchant BTC cards (Cashu/Spark) | Merchant product, not generic peer gift vaults |

---

## 6. Other chains

| Examples | Model | Relevance |
|----------|--------|-----------|
| Monaco (Solidity gift-card contracts on GitHub) | On-chain create/claim on **EVM** | Same *idea* (contract escrow/claim); not Bitcoin L1 |
| Generic “crypto gift card” SaaS | Custodial ledgers | Out of scope |

---

## 7. Comparison matrix

| Requirement | Paper wallet | LNURLw / Lightsats | Cashu card | Blitz gift | **BTC Giftcard SPEC** |
|-------------|--------------|--------------------|------------|------------|------------------------|
| Recipient address unknown at fund | Yes | Yes | Yes | Yes | Yes |
| Platform cannot spend gift | Yes* | No (node/service) | Mint holds BTC | Self-custody / Spark | Website: never |
| On-chain scripted refund | No | Policy/service reclaim | No | Product reclaim | **Yes (CSV + R)** |
| Pure Bitcoin L1 vault | Yes | No | No | No (Spark) | **Yes** |
| Normie claim UX | DIY | Strong | Partial | Strong (app) | **Static web + offline** |
| Works if product domain dies | If key kept | Host-dependent | Token on device | Seed in wallet | **Package + offline HTML** |

\*Assuming honest client-side keygen and no server copy of the key.

---

## 8. Differentiation (positioning)

Ship and describe BTC Giftcard as:

1. **Vault = user Taproot UTXO**, not a company or LN node balance  
2. **Timeout path enforced on-chain** (refund / donate / custom `R`)  
3. **Site is optional** (share package + offline claim)  
4. **No accounts**; website process never has spend keys  
5. **LN only as swap rail**, not the gift store of value  

Do **not** claim uniqueness of “gifting Bitcoin” (paper wallets and gift links already exist).  
**Do** claim uniqueness of this **stack** if implemented as specified.

---

## 9. Lessons for product / engineering

| Lesson | Action |
|--------|--------|
| Browser JS compromise steals open claims | Offline HTML, SRI, reproducible builds (SPEC §13) |
| Users expect reclaim if unopened | Post-`T` race is honest; refund UX must re-check UTXOs |
| LN gift UX is smoother for small amounts | Keep LN ADR-gated; don’t abandon L1 for “easy” host vouchers |
| Cashu privacy is attractive | Optional future research; different trust model (I-series backlog) |
| Blitz/LNbits share flows are polished | UX reference only; implement claim/refund against SPEC crypto |

---

## 10. Sources (sampled 2026-07-11)

- Blitz Wallet README / site — gifts, reclaim, self-custody, Spark  
- LNbits withdraw extension — LNURL-w vouchers  
- Lightsats / Blink LNURL-withdraw explainers — gift + reclaim patterns  
- Cashu.space, CashuCards GitHub, Agicash — ecash gift cards  
- Azteco — redeem-to-any-wallet vouchers  
- Classic paper-wallet / redeemable-key gifting literature  
- Monaco (EVM) — smart-contract gift cards (cross-chain analogue)

*Web product claims change; re-verify custody before citing in marketing.*

---

## 11. Revision history

| Date | Change |
|------|--------|
| 2026-07-11 | Initial research write-up from pre-implementation review |
