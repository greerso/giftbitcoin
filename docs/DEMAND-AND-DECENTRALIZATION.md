# Demand, why the gap exists, and a decentralized website

**Date:** 2026-07-11  
**Related:** [COMPETITIVE-LANDSCAPE.md](./COMPETITIVE-LANDSCAPE.md) · [SPEC.md](../SPEC.md) · [TODO.md](../TODO.md)

---

## 1. Is there demand?

### Yes for “gift Bitcoin” — weaker for “this exact stack”

**Evidence of gifting demand (crypto broadly, not only non-custodial L1):**

- Holiday surveys (e.g. PayPal/crypto gifting polls around late 2025) report substantial interest: on the order of **~17%** of US adults preferring crypto over a traditional gift card in some polls, **~24%** having given or considering giving crypto, and much higher intent among existing crypto holders (~**65%** consider gifting).  
- Gen Z / holiday wish-list coverage repeatedly frames crypto as a desired gift.  
- Retail **Bitcoin/crypto gift cards and vouchers** (Azteco, in-store cards, Bitrefill-adjacent commerce) keep appearing — commercial operators only stock what sells.  
- Wallet features that **exist because users ask**: Blitz Gifts, LNbits LNURLw vouchers, Lightsats-style tip/gift + reclaim, Cashu “cards.”

**What people actually buy today (revealed preference):**

| Product people use | Why it wins commercially |
|--------------------|---------------------------|
| Custodial / voucher rails (exchange send, Azteco, brand cards) | Easy for nocoiners; support; familiar “code” |
| LN gift links (LNURLw, Lightsats) | Instant, cheap, reclaim if unopened |
| In-wallet gifts (Blitz) | Polished mobile UX |
| DIY paper wallet / seed | Niche sovereignty crowd only |

So: **demand for the *job* (“give someone Bitcoin without their address”) is real.**  
Demand for **sovereign L1 Taproot gift vaults with offline packages** is a **subset**: people who care about non-custody, scripted refund, and site-optional recovery — overlapping “Bitcoin maximalist / self-custody” + thoughtful gifters, not the full holiday mass market.

### Demand shape for *this* product

| Segment | Size (qualitative) | Fit |
|---------|-------------------|-----|
| Bitcoiners gifting family who have no wallet yet | Medium | High if claim UX is dead simple |
| Privacy/sovereignty users who refuse custodial vouchers | Small–medium | Very high |
| Mass market “Amazon gift card but BTC” | Large | Low unless claim feels like Venmo (hard without custody) |
| Merchants issuing closed-loop cards | Separate market | Agicash etc. already attack this |

**Honest forecast:** viable as a **focused open-source tool / static app** with seasonal spikes; unlikely to out-grow Bitrefill on GMV while staying fully non-custodial. Success metrics should be **gifts completed, not “unicorn TAM.”**

---

## 2. Why doesn’t *this* already exist?

The *idea* exists (paper wallets + gift links). The **SPEC stack** is rare because several forces push builders elsewhere.

### 2.1 Market incentives favor custody or LN pools

- Support tickets, “I lost my link,” chargebacks, and regulation are easier if you **hold balances** or issue **voucher codes**.  
- LNURL-withdraw is one afternoon of work on LNbits; **correct Taproot miniscript + multi-wallet claim + offline HTML** is weeks of careful crypto UX.  
- Startups optimize for **conversion of nocoiners**, not protocol purity.

### 2.2 Self-custody UX is still the bottleneck

- Seed phrases and irreversible loss are well-documented barriers; large amounts of BTC are estimated lost to self-custody mistakes.  
- A non-custodial gift forces the recipient into **wallet setup or address paste** — the hard part of Bitcoin. Custodial gifts hide that until later (or forever).  
- Paper wallets got a reputation as **error-prone / phishing-prone** (malicious generators, address reuse, no refund if lost). Builders abandoned the pattern instead of modernizing it.

### 2.3 Regulatory and liability fear

- Anything that looks like “we help move money” attracts **money-transmitter** anxiety.  
- Even keyless static sites get questioned; many teams choose **clearly custodial + licensed** or **self-hosted-only tools** (LNbits) rather than a public consumer brand for bearer links.  
- Bearer links = **irreversible theft if leaked** → support nightmare and bad press.

### 2.4 Technical timing

- **Taproot** (2021) made clean dual-path scripts nicer; miniscript/descriptors and browser WASM stacks matured later.  
- Pre-Taproot “gift + timeout refund” was uglier (bare multisig / CLTV templates, worse fees/privacy).  
- Teams that wanted gifts after 2021 often chose **Lightning** (fees, speed) instead of L1 vaults.

### 2.5 Security of *web* claim apps is scary

- Compromised claim JS = **mass theft** of every open gift.  
- Responsible builders hesitate to put “pretty website holds the signing path in the browser” without heavy process (reproducible builds, offline fallback) — which is exactly what SPEC requires and what most MVPs skip.

### 2.6 Economic fit

- On-chain gifts need **min amounts and fees** (SPEC ~100k sats floor).  
- Small social gifts want **satoshi tips** → LN/ecash, not L1.  
- So L1 non-custodial gifts serve **meaningful amounts**, not coffee-money spam — a smaller market.

**Summary:** Demand exists; **incentives, UX risk, regulation, fees, and easier LN/custody substitutes** explain the gap. You’re not late to a crowded protocol niche — you’re early to a **deliberately hard** niche others avoided.

---

## 3. Can the website live decentralized too?

**Yes — and SPEC is already shaped for it** (static client, no server secrets, offline package). The *coins* are decentralized by script; the *UI* can be content-addressed and mirrored.

### 3.1 What “decentralized website” means here

| Layer | Centralized default | Decentralized option |
|-------|---------------------|----------------------|
| **Files (HTML/JS/CSS)** | Vercel/Netlify/S3 | **IPFS** (CID), optional Filecoin/Arweave pin |
| **Name** | `gift.example.com` (DNS) | ENS `name.eth` → contenthash; optional DNSLink on a domain; Bitcoin-adjacent naming is thinner |
| **Access** | One origin | Any IPFS gateway, local IPFS node, `eth.limo` / similar |
| **Updates** | Deploy overwrite | New CID; name record points to new hash (governance: multisig) |
| **Chain data** | Your Esplora proxy | User-selected public indexers (already in SPEC) |

The app does **not** need a backend for create/claim if all crypto is client-side. That is the key enabler.

### 3.2 Practical architecture (aligned with SPEC)

```text
                    ┌─────────────────────────────┐
  share_card / URL  │  Static app (create + claim) │
                    │  same bytes on many mirrors  │
                    └─────────────┬───────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
    IPFS CID (canonical)   Classic HTTPS mirror    Offline HTML (USB/print)
           │                      │
           ▼                      ▼
    ENS / DNSLink          Cloudflare/Netlify
           │
           ▼
    User browser ──► public Esplora/Electrum (user-chosen)
           │
           ▼
    Bitcoin P2P consensus (funds)
```

**Normative recommendation for this project:**

1. **Canonical release** = IPFS CID of reproducible build (publish in GitHub releases + Appendix).  
2. **Convenience** = HTTPS domain (and/or ENS gateway) pointing at that CID or identical bytes.  
3. **Always** ship offline claim HTML + share_card so gifts outlive every host.  
4. **Never** put claim secrets on any host; decentralization of UI does not fix a malicious JS build — **reproducible builds + multiple pins** do.

### 3.3 Limits (be honest)

| Limit | Reality |
|-------|---------|
| Normie access | Most people open `https://…`, not `ipfs://` or `.eth` without a gateway |
| Gateways | `eth.limo` / public IPFS gateways are **convenient central chokepoints** unless users run a node |
| Indexers | Fetching UTXOs still depends on **some** Bitcoin data source (public Esplora, own node, Electrum) — not “fully trustless UI” unless user brings a node |
| Updates | Someone must publish new CIDs (project multisig); decentralization ≠ unmaintained |
| ENS | Ethereum naming for a Bitcoin product is slightly ironic; still the best UX for contenthash today |
| Compromised build | Decentralized hosting of **bad** JS still steals funds — verify CID against signed release |

### 3.4 How decentralized is “enough”?

| Tier | What you ship | Fits goals |
|------|----------------|------------|
| **T0** | Single HTTPS host only | Weak vs SPEC decentralization goal |
| **T1** | HTTPS + offline package + reproducible builds | Good v1 |
| **T2** | T1 + IPFS pin + published CID + mirror list | Strong |
| **T3** | T2 + ENS/DNSLink + community pins + optional Tor onion | Excellent |
| **T4** | T3 + users default to own node/Electrum | Maximum (power users) |

SPEC already requires the hard part of T1–T2 (offline + client crypto). **T2/T3 should be explicit product goals**, not afterthoughts.

### 3.5 Suggested SPEC/TODO additions (tracked)

See TODO **D1–D5** (decentralized delivery).

---

## 4. Synthesis

| Question | Answer |
|----------|--------|
| **Demand?** | Yes for gifting Bitcoin; narrower but real for non-custodial L1. Don’t expect mass-market GMV without custody. |
| **Why not already?** | Custody/LN is easier, more supportable, better for tiny amounts; paper wallets burned UX trust; Taproot+careful web crypto is hard; liability and JS-supply-chain fear. |
| **Decentralized site?** | Yes: static app on IPFS (+ ENS/DNSLink), mirrors, offline HTML; chain data via user-chosen indexers. Coins already don’t need your server. |

**Strategic posture:** build for the sovereignty niche with seasonal mainstream curiosity; measure success by completed non-custodial gifts and verifiable releases, not exchange-style volume.

---

## 5. Revision history

| Date | Change |
|------|--------|
| 2026-07-11 | Initial demand / gap / decentralized-web analysis |
