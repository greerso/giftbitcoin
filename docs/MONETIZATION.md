# Monetization — earning income without breaking the model

**Date:** 2026-07-11  
**Constraints (from SPEC):** website process never holds spend keys; no forced protocol fee in script (bypassable offline); security / privacy / decentralization paramount; **default 3% project tip at create, fully editable (including 0)** — separate payment to project address.

If a revenue idea requires the site to **hold, route, or reissue** gift funds, it is **out of scope** for this product (custody + legal surface).

---

## 1. Reality check

| Fact | Implication |
|------|-------------|
| App is static / client-side crypto | You are not a payment processor of the gift UTXO |
| Offline package works without your domain | You **cannot** enforce a cut of every gift |
| Bearer links + no accounts | Hard to “subscribe users” without adding identity |
| Niche sovereignty market | Unlikely to print Bitrefill-scale GMV |
| Trust is the product | Aggressive monetization that looks custodial kills adoption |

**Honest framing:** income will look like **open-source sustainability + optional value-adds**, not “take 2% of all Bitcoin gifts.”

---

## 2. Compatible revenue (preferred)

### 2.1 Default 3% tip at create (editable) — SPEC §8.1

- UI **pre-fills 3%** of gift amount as project tip.  
- Sender can **edit** % or sats, or set **0** (“No tip”).  
- Pays to a **published project address / LN**, separate from the gift vault (extra output or second payment).  
- **Never** skimmed from the gift script or baked into claim.  
- Distinct from `donate_project` expiry (unclaimed after `T`).

**Income quality:** better conversion than opt-in-from-zero; still seasonal and trust-dependent.  
**Risk:** low if clearly labeled optional/editable and never required for “Ready to gift.” High if UI dark-patterns hide the control — **forbidden**.

### 2.2 Unclaimed `donate_project` policy

- Senders choose unclaimed → project after `T`.  
- Cold key sweeps only **opt-in** cards after CSV.  
- Not a reliable P&L line (most gifts should claim); treat as **secondary**.

**Risk:** short `T` + pushy defaults looks like delayed custody — keep long default `T`, refund default, clear copy (SPEC already).

### 2.3 Hosted convenience (not custody of gifts)

Charge for things the **static CID** does not need:

| Offering | What they pay for | Must not include |
|----------|-------------------|------------------|
| **Premium HTTPS domain / SLA** | Pretty URL, uptime, CDN, support email | Holding claim keys |
| **Indexer / broadcast relay** | Rate-limited Esplora proxy, privacy-respecting defaults | Logging secrets; exclusive forced backend |
| **White-label / self-host kit** | Branding pack, deploy scripts, support for NGOs/events | Your keys on their gifts |
| **Printed cards / fulfillment** | Physical print of share QR + design | You generating secrets server-side |
| **Training / workshops** | “Run a gift booth at conference” | Moving their coins |

### 2.4 B2B / events (strong fit)

- Conference “orange pill” booths, employer gifting, meetup giveaways.  
- Sell **setup + design + on-site support** while software stays free/OSS.  
- Org self-hosts or uses your static build; they fund gifts from their wallets.

### 2.5 Grants and sponsorships

- OpenSats, Brink, HRF, corporate Bitcoin sponsors, GitHub Sponsors.  
- Fits pure public-goods positioning (“keyless gift standard”).  
- Often better ROI than ads for this niche.

### 2.6 Dual-track: free protocol + paid product around it

| Free (protocol / OSS) | Paid (optional) |
|----------------------|-----------------|
| Spec, reference app, IPFS CID | Support SLA |
| Create / claim / refund | Custom design / print |
| Offline package | Event staffing |
| No accounts | White-label domain + analytics **without** secrets |

### 2.7 Adjacent products (careful)

- **Educational** “gift Bitcoin safely” course.  
- **Hardware** partnership (referral for wallets when claimants need one) — disclose; don’t dark-pattern.  
- **Swap affiliate** for optional LN claim (Boltz-class) — only if disclosed; never required; privacy tradeoff.

---

## 3. Fragile or incompatible ideas

| Idea | Why it conflicts |
|------|------------------|
| **Mandatory % fee in claim tx** | Offline/alternate client skips it; trains users to distrust you |
| **“We hold the gift until they sign up”** | Full custody; kills “legal doesn’t matter by design” |
| **Account balances / gift inventory** | Custodial ledger |
| **Insurance that you reimburse lost links** | You become underwriter; needs capital + custody-like ops |
| **Selling claim analytics (who opened what)** | Privacy violation; often needs server-side tracking of links |
| **SEO spam / aggressive affiliate walls** | Destroys trust for a bearer-cash product |
| **Custodial LN gift balances “for UX”** | Same as Lightsats economics, different product |

---

## 4. Practical income mixes (scenarios)

### A. Public-goods maintainer (low ops)

- Tips + GitHub Sponsors + occasional grant.  
- Time: maintenance + seasonal pushes.  
- Income: modest / irregular.

### B. Services business (recommended if you want real income)

- Free OSS core.  
- Paid: event gifting, white-label for communities, print+design, priority support.  
- Income: project-based invoices in BTC/fiat.

### C. Convenience SaaS (thin)

- Free self-serve static app.  
- Paid: custom domain, higher-rate indexer, branded packages, email **delivery of package the user already downloaded** (you never see secrets if client encrypts — hard; safer to only email **watch-only** or instructions).  
- Prefer **not** to email share_card secrets through your servers.

### D. Hybrid tip + services

- Default path for most solo maintainers: optional tips + 2–3 paid service offerings/year around holidays and conferences.

---

## 5. What to implement in product (minimal)

1. **Default 3% tip** on create, editable down to 0; dual % / sats controls (§8.1).  
2. **Public tip addresses** (on-chain + LN) in footer, create UI, and README.  
3. **Sponsors page** (grants, GitHub Sponsors).  
4. Keep `donate_project` honest and non-default.  
5. Do **not** build fee skimming into gift scripts.

Tracked as **M1–M5** in TODO.md.

---

## 6. Legal / tax note (not advice)

- Tips, service invoices, and unclaimed-donate sweeps may still be **taxable income** in your jurisdiction even if you never custody gifts.  
- “Non-custodial software” ≠ “no tax return.”  
- If you sell services or operate a brand in a given country, get **local** advice before promising “legal doesn’t matter” for *your* revenue activities (distinct from gift UTXO custody).

---

## 7. Bottom line

| Goal | Approach |
|------|----------|
| Stay pure | Tips + grants + `donate_project` dust |
| Earn meaningful income | **Sell time and convenience** (events, white-label, print, support), not a cut of UTXOs |
| Scale like a fintech | Requires custody/compliance — **different product** |

You earn by being the **trusted implementer and host of convenience**, while the **money in the gift stays in script the user controls**.

---

## 8. Revision history

| Date | Change |
|------|--------|
| 2026-07-11 | Initial monetization options under SPEC constraints |
