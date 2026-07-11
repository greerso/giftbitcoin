# 2026 self-custody recommendations & buy-BTC on-ramp

**Research date:** 2026-07-11  
**Purpose:** Lock claim/create destination lists to current beginner-friendly self-custody options, and define how senders who **don’t already hold BTC** can buy inline without us taking custody.

Related: [CLAIM-UX.md](./CLAIM-UX.md) · [SPEC.md](../SPEC.md) · [TODO.md](../TODO.md)

---

## 1. Self-custody for new users (2026 snapshot)

### 1.1 What sources broadly agree on

Across Lightning comparisons, Bitcoin Magazine–style roundups, and beginner lists in 2025–2026:

| Tier | Wallet | Custody | Best for | Notes |
|------|--------|---------|----------|--------|
| **A — default mobile** | **[Phoenix](https://phoenix.acinq.co/)** (ACINQ) | Self-custody | Phone newbs, LN + simple on-chain | Most often “best self-custodial Lightning”; auto channels; feels easy |
| **A — mobile alt** | **[Muun](https://muun.com/)** | Self-custody | Phone newbs, simple payments | Frequently listed with Phoenix for beginners |
| **A — mobile / multi** | **[BlueWallet](https://bluewallet.io/)** | Self-custody (on-chain); LN depends on setup | Beginners wanting OSS Bitcoin focus | Strong “beginner Bitcoin wallet” mentions; iOS/Android |
| **A — desktop** | **[Sparrow](https://sparrowwallet.com/)** | Self-custody | Desktop, serious BTC, HW later | Often “best Bitcoin desktop / overall” for control; steeper than phone apps |
| **B — advanced mobile** | **ZEUS**, **Breez** | Self-custody | Power / node-oriented users | List under Advanced, not default newb |
| **B — hardware** | **Bitkey**, Trezor, Coldcard+Sparrow | Self-custody | Larger amounts later | Optional “level up” after claim; not required to claim a gift |
| **Not self-custody** | Wallet of Satoshi, many exchange apps | **Custodial** | Ease only | May appear under **Exchange / simple app**, never under “you control the keys” |

**Product rule:** Default **Recommended** cards must only feature **true self-custody** (A-tier). Custodial apps stay available under exchange/simple paths.

### 1.2 What we support (normative list for `destinations.json`)

**Claim — Recommended**

| Device | Primary | Alternates (same tier) |
|--------|---------|------------------------|
| Phone | `phoenix` | `muun`, `bluewallet` |
| Desktop | `sparrow` | Continue-on-phone → Phoenix/Muun; optional `bluewallet` if desktop build promoted |
| Lightning prefer | `phoenix` | Any LN-capable self-custody from list |

**Claim — always available**

- All A + B self-custody guides  
- Exchanges: Coinbase, Gemini, Kraken, Cash App, Strike, Other  
- Paste any address  
- Hardware via Sparrow/Bitkey guides (Advanced)

**Receive formats we must accept as claim outputs**

- On-chain: any standard BTC address type our network supports (`1` / `3` / `bc1q` / `bc1p` / testnet `tb1…`)  
- Lightning (when §9 on): BOLT11 invoice, LNURL-pay where applicable, lightning address if swap stack supports it  

No wallet-specific API required to **support** a wallet — paste address/invoice is enough. Guides + store links make it “supported.”

### 1.3 Refresh policy

Re-review wallet list **every 12 months** or when a featured app shuts down / changes custody model. Track as TODO **W-refresh**.

---

## 2. Senders who need to **buy** BTC to fund a gift

### 2.1 User story

> “I want to send a Bitcoin gift but I only have a debit card / bank account.”

### 2.2 What we can do without becoming a custodian

**Yes — buy *to the gift address* (or to a buffer they control), using licensed third parties.**

Ideal flow:

```text
1. Client generates gift Taproot address (+ tip amount)
2. UI: gift sats + tip + fee buffer = "Buy this much BTC"
3. User opens on-ramp with destinationAddress = gift address (and/or tip as second step)
4. On-ramp does KYC + payment (Coinbase / MoonPay / Ramp / etc.)
5. BTC lands on gift address → our watch loop → Ready to gift
```

We never hold private keys or the purchased BTC. The on-ramp provider is the regulated party for the fiat purchase.

### 2.3 Can we use Strike, Coinbase, Kraken, Gemini “inline”?

| Provider | Inline / embed buy-to-address? | Fit for us |
|----------|--------------------------------|------------|
| **Coinbase Onramp** (CDP) | **Yes** — designed to fund **any wallet address** from an app; hosted + headless options; BTC supported | **Primary candidate** for US-friendly embed |
| **MoonPay** | **Yes** — widget/SDK; prefill wallet address + amount | **Strong global** candidate |
| **Ramp Network** | **Yes** — widget/SDK; destination wallet | **Strong** candidate |
| **Stripe Crypto Onramp** | **Yes** — embedded/hosted fiat→crypto to destination | Candidate where available |
| **Onramper** (aggregator) | **Yes** — one integration, many ramps | Good for coverage |
| **Strike** | API is strong for **payments** (LN/on-chain send/receive for businesses), not a classic “guest buy BTC to arbitrary address” consumer on-ramp widget like MoonPay | **Deep link** “Buy on Strike → send to this address” more realistic than full embed |
| **Kraken / Gemini** | No widely used third-party **embed** that deposits straight to *our* gift address without user account + withdraw | **Guided path:** open exchange → buy BTC → withdraw to gift QR |

**Honest answer:**

- **Inline from Coinbase (Onramp), MoonPay, Ramp, Stripe-style widgets: yes** (with partner approval + geo limits).  
- **Inline from Kraken/Gemini brand widgets: generally no** — use **guided buy + withdraw to gift address**.  
- **Strike: partial** — excellent Bitcoin app path; treat as **deep link / guide**, not assume CDP-style on-ramp unless their product explicitly adds destination-address on-ramp for partners.

### 2.4 Create-flow UX (required product section)

After amount + tip chosen and address generated:

```text
How will you fund this gift?
  ⭐ Buy Bitcoin now     → on-ramp chooser (Coinbase Onramp / MoonPay / …)
  📱 I use Strike / Cash App / exchange → guide: buy then send to QR
  🔗 I already have Bitcoin → show QR / address only
```

**Buy now details:**

- Prefill: asset BTC, network Bitcoin, **wallet address = gift address**, amount ≥ gift + tip + recommended fee buffer.  
- Show: “Purchases are handled by [Partner]. They may require ID. We never hold your card or keys.”  
- Watch gift address; don’t mark Ready until conf policy met.  
- If on-ramp underpays: underfund UX (SPEC §8.2).  
- If user buys to **their** wallet by mistake: instructions to forward to gift address.

**Tip payment:** either (a) include tip in same on-ramp if multi-output not supported — **two-step**: fund gift first, optional tip second; or (b) sender pays tip separately from already-held BTC. Prefer clear split in UI.

### 2.5 Architecture constraints (align with non-custody)

| Do | Don’t |
|----|--------|
| Pass **gift address** as destination to partner | Receive fiat ourselves |
| Open partner widget/redirect or approved SDK | Store card data |
| Optional server only for **partner session tokens** if CDP requires it (no keys of gifts) | Pool user BTC |
| Feature-flag per region | Promise worldwide buy if partners geo-block |
| Disclose partner fees/KYC | Call it “fee-free Bitcoin from us” |

Session tokens for Coinbase Onramp often need a **small backend** — that backend must **not** learn claim secrets or gift private keys (address is public).

### 2.6 v1 vs later

| Phase | Scope |
|-------|--------|
| **v1 (testnet)** | Fund via testnet faucet + “I already have BTC” QR; **stub** “Buy Bitcoin” UI with mainnet copy disabled or mock |
| **v1.1 mainnet** | One live on-ramp (recommend **Coinbase Onramp** *or* **MoonPay/Ramp** after approval) + guided Strike/Kraken/Gemini |
| **v1.2** | Onramper aggregator or second ramp for geo coverage |

### 2.7 Legal / ops note (not advice)

- On-ramp partner is typically the MSB/VASP for the **purchase**.  
- Your software still shouldn’t custody gifts.  
- Partner contracts, restricted jurisdictions, and tax reporting on **your** tips/services remain separate.  
- Get counsel before production fiat rails.

---

## 3. Updates to recommendation config (summary)

```jsonc
{
  "recommended": {
    "mobile": ["phoenix", "muun", "bluewallet"],
    "desktop": ["sparrow"],
    "desktopAlsoSuggestPhone": true,
    "lightning": ["phoenix", "muun"]
  },
  "onramp": {
    "embed": ["coinbase_onramp", "moonpay", "ramp_network"],
    "guideOnly": ["strike", "kraken", "gemini", "coinbase_exchange_app"],
    "destination": "gift_address"
  }
}
```

---

## 4. Sources (sampled 2026-07-11)

- Lightning wallet comparisons listing Phoenix as easiest self-custody LN (e.g. spark.money tools, Bringin, Bitcoin Magazine–style 2026 lists)  
- Beginner wallet articles citing BlueWallet, Muun, Phoenix  
- Desktop: Sparrow widely recommended for Bitcoin-only self-custody / control  
- Coinbase Developer Platform Onramp docs — fiat → crypto to **any wallet address**, BTC included  
- MoonPay / Ramp Network business widgets — destination wallet address  
- Strike API docs — payments-oriented; not assumed full guest on-ramp embed  

Re-verify partner docs before integration (APIs and deprecations change; e.g. Coinbase hosted widget timelines).

---

## 5. Revision history

| Date | Change |
|------|--------|
| 2026-07-11 | Initial 2026 wallet research + on-ramp design for gift funding |
