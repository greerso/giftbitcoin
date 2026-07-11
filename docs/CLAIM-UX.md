# Claim UX — newbs, self-custody, Lightning, APIs

**Date:** 2026-07-11  
**Status:** Product design (implements SPEC §7.2)  
**Goal:** Complete beginners can claim in minutes on **phone or desktop**, with a **clear self-custody recommendation**, while **every option** (exchange, any address, Lightning) stays one tap away.

**Non-negotiable:** Until claim confirms, the gift stays in the **user’s Taproot vault** (website never holds it). After claim to an exchange, **that platform’s rules apply** — disclose clearly.

---

## 1. Design principles

1. **Recommend, don’t force** — encourage easy self-custody; never block exchanges or “paste any address.”  
2. **Device-aware defaults** — phone → mobile wallet path; desktop → desktop or QR-to-phone path.  
3. **Destination chooser first** — “Where should we send it?” not “Enter a bc1 address.”  
4. **Zero Bitcoin knowledge** — plain language; jargon only under Advanced.  
5. **Any valid Bitcoin address** as an on-chain output (legacy / nested / segwit / taproot).  
6. **Lightning first-class when enabled** — better for speed/fees when amount and UX fit.  
7. **No custody, no exchange login** — guide to copy a deposit address; never passwords/API keys/OAuth that can move funds.  
8. **Net after fee** always shown before confirm.  
9. **Mobile-friendly claim page** even when recommending desktop wallets.

---

## 2. Recommendation engine (complete newb)

### 2.1 Detect context

| Signal | Use |
|--------|-----|
| Viewport / UA ≈ mobile | Prefer **phone wallet** recommendation |
| Desktop browser | Prefer **desktop wallet** or **phone via QR** |
| Gift net amount | Small → bias **Lightning** (when on); large → bias **on-chain self-custody** |
| Region (optional, coarse) | App store availability hints only — never block |
| User override | Always available: “Show all options” |

Do not require location permission. Optional `Accept-Language` / manual country for store links only.

### 2.2 Ranking philosophy

```text
Priority for "Recommended for you":
  1. Easy self-custody on this device (phone app or desktop app)
  2. Lightning self-custody (if feature on + amount suitable)
  3. Simple hybrid apps (Cash App / Strike where they hold less like an exchange)
  4. Full custodial exchanges (Coinbase, Gemini, Kraken, …)
  5. Paste any address / hardware (always available, not buried)
```

**Tone:** “We recommend X so you control your Bitcoin. Prefer an exchange? Totally fine — pick below.”

### 2.3 Phone newb (recommended stack)

**Primary recommendation card (highlighted):**

> **Get a free Bitcoin wallet on your phone**  
> About 2 minutes. You control the Bitcoin (not an exchange).  
> **Suggested:** **Phoenix** (primary, 2026), then Muun or BlueWallet — see [WALLETS-AND-ONRAMP-2026.md](./WALLETS-AND-ONRAMP-2026.md).

Steps (in-app):

1. Install Phoenix (or Muun / BlueWallet) from App Store / Play (store buttons).  
2. Open app → create wallet → **write down recovery words** offline (one calm screen explaining why).  
3. Tap **Receive** → copy Bitcoin address (on-chain) **or** Lightning invoice if LN claim path.  
4. Return here → paste → Send my gift.

**Secondary (same screen, smaller):**

- “I already use Cash App / Strike / …”  
- “Send to Coinbase, Gemini, Kraken…”  
- “I have an address already”

### 2.4 Desktop newb (recommended stack)

**Primary recommendation card:**

> **Wallet on this computer**  
> **Suggested:** **Sparrow** (2026 desktop standard).  
> **Or scan with your phone** (Phoenix) — often easier for newbs.

Two sub-paths:

| Path | Steps |
|------|--------|
| **A. Desktop wallet** | Download Sparrow (or listed app) → new wallet → backup seed → Receive → copy address → paste |
| **B. Phone (encouraged alternative)** | “Easier for many people” → show steps to install phone wallet → **QR of claim page or paste** so they finish on mobile |

Desktop claim page should offer: “Continue on phone” with a **QR of the claim URL** (fragment secrets: prefer QR of full URL only if fragment is included client-side in QR generation — **must** build QR in-browser from `location.href` so secret never hits a QR API server).

### 2.5 “Help me choose” decision tree

Short 2–3 taps:

1. **Where are you now?** Phone / Computer  
2. **What matters most?**  
   - “I want control / learning” → self-custody recommend  
   - “I already have Coinbase/Gemini/Kraken” → that exchange guide  
   - “Fastest / smallest fee” → Lightning if on, else on-chain with fee explainer  
   - “Just make it work” → self-custody phone app **or** their existing exchange if they pick one  

Always end with **Recommended** + **Other options** list.

### 2.6 Self-custody encouragement (required copy, not nagware)

On review screen when destination is an **exchange**:

> You’re sending to an exchange. That’s OK. For future gifts, a phone wallet (Phoenix/Muun) means you hold the keys. [Why this matters — one paragraph link]

On success after **self-custody**:

> Nice — this Bitcoin is in a wallet you control. Keep your recovery words safe offline.

Never guilt or block exchange claims.

---

## 3. Destination chooser layout

```text
┌─────────────────────────────────────────────┐
│  ⭐ Recommended for you                     │
│  [Phone wallet · Phoenix]  or  [Desktop…]   │
│  Why: you control it · ~2 min setup         │
└─────────────────────────────────────────────┘
│  ⚡ Lightning (fast)     — if enabled        │
│  🏦 Exchange (Coinbase, Gemini, Kraken…)    │
│  📱 Other phone apps (Cash App, Strike…)    │
│  📋 Paste any Bitcoin address               │
│  ❓ Help me choose                          │
```

Order: **Recommended** → **Lightning** (if on) → **Exchanges** → **Other apps** → **Paste** → **Help**.

---

## 4. On-chain claim (all non-LN destinations)

Shared pipeline after guide:

1. Paste address → validate network + format.  
2. Fee estimate → **net**.  
3. Soft-warn exchange minimums if net is small.  
4. Confirm → sign claim leaf → broadcast.  
5. Success + destination-specific next steps.

### 4.1 Custodial exchanges (always available)

Guides for: Coinbase, Gemini, Kraken, Cash App, Strike, River, Swan, Other.

Pattern: Receive/Deposit → **BTC** → network **Bitcoin** → copy → paste.

Footguns: wrong asset, wrong network, min deposit, KYC incomplete, address expiry, claim-once.

### 4.2 Self-custody apps (featured + encouraged)

| Device | Featured (config-driven) | Role |
|--------|--------------------------|------|
| Phone | Phoenix, Muun | Default newb recommend |
| Phone alt | BlueWallet, Electrum mobile | Power / multi-coin |
| Desktop | Sparrow | Default desktop self-custody |
| Desktop alt | Electrum, Specter | Advanced |

Store links and screenshots/steps in `destinations.json`.

### 4.3 Paste any address

Always one click away. Label: “Hardware wallet, any app, or address from a friend.”

---

## 5. Lightning payments

### 5.1 Why include Lightning

| Benefit | For newbs |
|---------|-----------|
| Faster credit | Often seconds, not ~1h exchange waits |
| Lower fees | Better for smaller gifts |
| Familiar mobile UX | Invoice / LNURL / LN address in apps they install |

Vault remains **on-chain Taproot** until claim; LN is a **claim rail** via atomic reverse submarine swap (SPEC §9), not a custodial balance on our servers.

### 5.2 When to recommend Lightning

| Condition | Recommendation |
|-----------|----------------|
| LN feature flag off | Hide or “Coming soon” |
| Net amount below on-chain “feels expensive” threshold (config) | Prefer LN card in Recommended |
| User chose Phoenix/Muun with LN receive | Offer “Receive with Lightning (recommended)” vs “On-chain address” |
| User chose Coinbase/etc. without clear LN deposit | Prefer on-chain guide only |
| Large gift (config, e.g. &gt; X sats) | Prefer on-chain; LN as optional |

### 5.3 LN claim UX (when ADR enabled)

1. User picks Lightning (or wallet that prefers LN).  
2. Plain steps: open wallet → Receive → **Lightning** → copy invoice or LNURL or lightning address.  
3. Paste into claim page.  
4. Client runs **swap** per §9 ADR (Boltz-class): user sees “Converting gift → Lightning…” with failure → funds remain claimable (no strand with us).  
5. Success: “Arrived in your Lightning wallet.”

**Newb copy:** “Lightning is a faster way to move Bitcoin. Your wallet handles the details.”

### 5.4 LN + exchanges

Only list exchange LN deposit if guide is verified accurate. Default exchange path stays **on-chain BTC deposit** to minimize support load.

---

## 6. API integration — worth it?

### 6.1 Decision summary

| Integration type | Worth it? | Notes |
|------------------|-----------|--------|
| **Exchange deposit APIs / OAuth / “Connect Coinbase”** | **No (v1–v2)** | Phishing surface, liability, KYC coupling, API keys can be catastrophic; users already have Receive address UI |
| **User-pasted address only** | **Yes — default** | Simplest, safest, works with every wallet |
| **Swap provider API (LN claim)** | **Yes when LN on** | Required for reverse submarine swaps; client-side init; never send claim secret as custodial hold |
| **Public Esplora/Electrum** | **Yes** | UTXO + broadcast (already SPEC) |
| **Fiat price API** | **Yes optional** | Display only |
| **Wallet deep links / universal links** | **Yes light** | `bitcoin:`, app store URLs, documented schemes — no auth |
| **LNURL-pay/withdraw as destination** | **Yes when LN on** | Standard; not exchange OAuth |
| **Exchange “create deposit address” server-side with our API key** | **No** | That would be **our** sub-account custody theater — out of model |
| **Address validation libraries (local)** | **Yes** | Client-side bech32/base58 — not a network API |
| **QR code generation** | **Yes local only** | In-browser; never send address/secret to third-party QR APIs |
| **Partner referral links** (wallet signup) | **Optional later** | Disclose; must not dark-pattern vs self-custody |

### 6.2 Why not exchange APIs

1. **Security:** OAuth/token bugs and fake “Connect Coinbase” pages are a top scam pattern.  
2. **Product honesty:** Claim is “you paste where you want BTC,” not “we wire into your broker.”  
3. **Maintenance:** Exchange APIs and ToS change constantly.  
4. **Scope:** Violates “website never handles user brokerage credentials.”  
5. **Marginal UX gain:** Copy deposit address is already 2 minutes with good guides.

### 6.3 What to build instead of exchange APIs

- Excellent **step guides** + screenshots  
- **Clipboard paste** + validation  
- **Deep link** to app store / wallet download  
- Optional **`bitcoin:` URI** open for wallets that register handlers  
- **LN swap API** only for Lightning claim rail  

### 6.4 Future (revisit only with strong reason)

- Wallet Standard / open protocols that never expose hot keys to us  
- BIP21 + PayJoin (I6) — not exchange OAuth  
- If a major exchange ships a **user-authorized, deposit-address-only** open standard with no withdrawal scope — re-evaluate; still default to paste

---

## 7. Happy path screens

```text
Open link → Status → Recommended (device-aware)
    → Setup wallet OR open exchange guide OR Lightning
    → Paste address / invoice → Review → Send my gift
    → Success + next steps
```

### 7.1 Review & confirm

- Gift total, network/swap fee, **net**  
- Destination truncated + type (“Phoenix on-chain” / “Coinbase” / “Lightning invoice”)  
- Self-custody nudge if exchange  
- Primary CTA: **Send my gift**

### 7.2 Success

- On-chain: txid, explorer, exchange wait messaging if needed, claim-once  
- LN: “Check your wallet — should appear shortly”  
- Self-custody: recovery words reminder  
- Exchange: confirmation delay + support tip (txid)

---

## 8. Copy deck (additions)

| Moment | Copy |
|--------|------|
| Recommended phone | “Easiest with control: get a free wallet on your phone” |
| Recommended desktop | “Wallet on this computer — or continue on your phone” |
| Encourage self-custody | “You control the Bitcoin. Prefer an exchange? Use the options below.” |
| Exchange OK | “Sending to Coinbase is fine. Paste their Bitcoin deposit address.” |
| Lightning | “Faster and usually cheaper. Works with Lightning wallets.” |
| API-free trust | “We never sign into your exchange. You paste the address — that’s it.” |

---

## 9. Config shape (`destinations.json` sketch)

```jsonc
{
  "recommended": {
    "mobile": { "id": "phoenix", "alt": ["muun"] },
    "desktop": { "id": "sparrow", "alt": ["electrum"], "preferPhoneAlso": true },
    "lightningWallet": { "id": "phoenix" },
    "smallAmountPreferLn": true,
    "smallAmountSats": 200000
  },
  "destinations": [
    {
      "id": "phoenix",
      "kind": "self_custody",
      "devices": ["mobile"],
      "supports": ["onchain", "lightning"],
      "steps": [],
      "storeLinks": {}
    },
    {
      "id": "coinbase",
      "kind": "exchange",
      "devices": ["mobile", "desktop"],
      "supports": ["onchain"],
      "steps": [],
      "warnings": ["min_deposit", "wrong_network"]
    }
  ]
}
```

No API keys in config — only public URLs and copy.

---

## 10. Anti-patterns

| Don’t | Why |
|-------|-----|
| Force self-custody only | Blocks real users; abandon rate |
| Force exchange | Against product values |
| OAuth / API key to exchange | Security + custody-adjacent |
| Hold funds during signup | Custody |
| Third-party QR APIs with secret in URL | Leak |
| Recommend random unknown wallets | Stick to short reviewed list + “paste any” |

---

## 11. Success criteria

1. Phone newb reaches recommended self-custody claim path in ≤ 3 minutes of guided UI.  
2. Desktop newb gets desktop **or** continue-on-phone path.  
3. Exchange claim works with same quality of steps.  
4. Lightning path works when flag on; clear fallback to on-chain.  
5. No exchange API/OAuth in architecture.  
6. Self-custody is **visually recommended** without disabling other options.  
7. Claim secret never leaves the client.

---

## 12. Implementation tracking

See TODO **C1–C9** and **C10–C16** (recommendation engine, LN claim UX, API non-goals).

---

## 13. Revision history

| Date | Change |
|------|--------|
| 2026-07-11 | Initial claim UX |
| 2026-07-11 | Newb phone/desktop recommendations; self-custody encourage-all-options; Lightning; API integration decision |
