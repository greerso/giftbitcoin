# Gift Bitcoin — Product & Protocol Specification

**Public brand / domain:** **[giftbitcoin.app](https://giftbitcoin.app)** ([docs/BRAND.md](./docs/BRAND.md))  
**Status:** Draft v0.3.0 (brand locked: giftbitcoin.app)  
**Network (v1):** Bitcoin **testnet4** (see §14.0)  
**Last updated:** 2026-07-12  
**Changelog:** v0.2–v0.2.4 — see git history. **v0.2.5** — public name **Gift Bitcoin**, domain **giftbitcoin.app**. Crypto protocol labels (`BTCGiftcard/v1/…`, `btcgiftcard/v1/…`) remain frozen for address compatibility. **v0.2.6** — explicit **v1.1 milestone** (§14.4): offline-claim kit (§5.5 items 2–3), refund/expiry signing + `donate_project`/`custom` policy wiring (§14.1), indexer-override UI (§10.4) moved out of v1 core; success criteria §14.3.2/.5/.8 re-anchored to v1.1. No package or script changes. **v0.3.0** — send mechanism: transient email relay carve-outs (§5.1/§10.1/§13/§14.3.3), generated-only passphrases (§4.2.4), three-segment QR fragment (§5.4), Turnstile CSP entry (§13), per docs/superpowers/specs/2026-07-12-send-mechanism-design.md.

This document is the source of truth for design. Implementation must not contradict it without an explicit spec change.

**Related docs:** [docs/BRAND.md](./docs/BRAND.md) · [docs/COMPETITIVE-LANDSCAPE.md](./docs/COMPETITIVE-LANDSCAPE.md) · [docs/DEMAND-AND-DECENTRALIZATION.md](./docs/DEMAND-AND-DECENTRALIZATION.md) · [docs/CLAIM-UX.md](./docs/CLAIM-UX.md) · [docs/MONETIZATION.md](./docs/MONETIZATION.md) · [docs/WALLETS-AND-ONRAMP-2026.md](./docs/WALLETS-AND-ONRAMP-2026.md) · [TODO.md](./TODO.md).

---

## 1. Vision

A simple, beautiful website where anyone can create a **Bitcoin e-giftcard**: fund an on-chain output once, share a claim link, and let the recipient redeem to **their** address (on-chain or Lightning) **without the sender knowing that address in advance**.

**Paramount goals (in order):**

1. **Security** — website process cannot take funds; fraud and link-theft surfaces are minimized and disclosed  
2. **Privacy** — minimize correlation and logging; user-selectable chain backends  
3. **Decentralization** — site is convenience only; gifts remain claimable if the site dies  

**Secondary goals:**

- Easy for non-technical, non-Bitcoin-savvy users  
- Optional Lightning receive/send rails (post-v1 success bar unless ADR lands)  
- Honest threat model (bearer instrument, not a bank account)

---

## 2. Non-goals (v1)

| Non-goal | Rationale |
|----------|-----------|
| Custodial balances / “account credit” | Reintroduces operator spend and legal surface |
| Website process can freeze, reverse, or reissue gifts | Centralization; trust surface |
| Server-held claim secrets (“held” = persisted; transient §5.1 relay excluded) | Breaks “legal doesn’t matter by design” |
| 0-conf claimable gifts | Fraud (RBF / double-spend) |
| Email/SMS recovery of lost links | Custody-adjacent; not possible without secrets |
| Scheduled email delivery / resend | Requires persistent server state (send-and-forget only) |
| One-time-view link retrieval | Email prefetch bots burn the view — net-negative for money |
| Telegram / X / Messenger share integrations | Each leaks the link to the platform (server-side storage, t.co wrapping, Meta crawlers) |
| Mainnet | v1 is testnet4 only |
| Native LN vault (gift as LN channel balance on our node) | Custody; always-online requirements |
| KYC / user accounts | Conflicts with privacy and keyless design |
| Guaranteed privacy against chain analysis | Bitcoin is public; we only minimize *extra* leakage |
| Covenant forcing expiry payout to a fixed address | Requires CTV/APO-class features; not in v1 script |
| LN claim/fund in v1 **success criteria** | Requires swap ADR (§9); interfaces may exist behind flag |

---

## 3. Architecture summary

### 3.1 Trust model

Roles are split deliberately. **“Website process”** = servers, static hosting, and any hot infrastructure that serves the app. **“Project cold key”** = offline key material for `donate_project` only, never loaded into the website process.

| Party | Claim path `pk(C)` | Expiry path `older(T) ∧ pk(R)` |
|-------|--------------------|--------------------------------|
| Recipient (claim secret ± passphrase) | **Yes, until the UTXO is spent** (including after `T`) | No |
| Sender with refund backup (`refund_self`) | Only if they also kept the claim secret | **Yes, after CSV matures for that UTXO** |
| Holder of custom `R` (`custom`) | No | **Yes, after CSV matures** |
| Project cold key (`donate_project`) | No | **Yes, after CSV matures** (that policy only) |
| **Website process** | **Never** | **Never** (no claim keys; no refund keys; no donate hot keys) |
| **Email-relay link holders** (email delivery only) | The server MAY transiently relay a passphrase-protected `share_card` via `/api/send`; it never persists it and never sees the passphrase. The relay creates additional link holders: **Cloudflare** (one party wearing two hats — the edge sees the POST body, and Email Service delivery logs may retain sent bodies), the **recipient mailbox** (indefinitely), and **corporate mail link-rewriters** (Outlook SafeLinks / Proofpoint wrappers embed the full URL, fragment included). All are mitigated by the forced ≥51.7-bit generated passphrase (~$1.8e8 to crack at current Argon2id params) — that retention is why the passphrase is forced for email. | No (link alone insufficient) |

**Post-`T` race (normative):** After relative locktime matures on a UTXO, **both** claim path and expiry path are valid. **First confirmed spend wins.** There is no exclusive refund window. Product copy must not say “claim expires at T” or “after T only refund works.”

**Donate honesty:** Choosing `donate_project` grants the **project cold-key holders** post-`T` spend authority for that gift. That is not the website process, but it **is** spend authority held by the project entity. Disclose at create time.

### 3.2 Core primitive (honest name)

**Taproot output with two script paths: bearer claim key OR relative-timelock expiry key.**

This is *not* a classic HTLC locked to the recipient’s pubkey (recipient is unknown at funding). It is **bearer claim capability + scripted timeout** (“A + timeout”), productized as architecture **C**.

Expiry policy chooses **who holds `R`** (who may sign after CSV). The expiry spender chooses the **destination address at spend time**. v1 does **not** covenant funds to a fixed address.

### 3.3 Lightning

The **vault is always the on-chain Taproot UTXO**. Lightning is only:

- **In:** optional LN → chain swap to fund the gift address  
- **Out:** optional reverse submarine swap at claim so the recipient receives LN  

Third-party swap providers are optional rails, not custodians of the gift secret.

**v1:** LN UI may exist behind a feature flag, but **must not** be required for §14.3 success criteria until an approved swap ADR exists (§9).

---

## 4. On-chain script design

### 4.1 Output type

- **SegWit v1 Taproot** (bech32m; testnet4 HRP `tb`)  
- **Key path:** unspendable via fixed **NUMS** internal key (§4.4)  
- **Script paths (exactly two leaves, fixed order):**

| Tree index | Name | Miniscript |
|------------|------|------------|
| 0 (first leaf) | Claim | `pk(C)` |
| 1 (second leaf) | Expiry | `and_v(v:older(T), pk(R))` |

**Normative descriptor template:**

```text
tr(<NUMS_XONLY>,{pk(<C_XONLY>),and_v(v:older(<T>),pk(<R_XONLY>))})
```

- Leaf version: **0xc0** (Taproot tapscript, BIP342)  
- Tree: two leaves as above; **do not reorder** (order is part of address identity)  
- `C_XONLY`, `R_XONLY`, `NUMS_XONLY`: **32-byte x-only** public keys (BIP340), hex-encoded lowercase in packages  
- `T`: BIP68 relative locktime value in **blocks** (type-flag clear), as used by miniscript `older(T)`

### 4.2 Key derivation (normative — single algorithm)

All gift key material is generated **in the sender’s client** (browser or offline tool). Website process never generates `C` or `R` for user gifts.

#### 4.2.1 Claim secret

- `claim_secret`: 32 bytes from CSPRNG (`crypto.getRandomValues` or OS CSPRNG).

#### 4.2.2 Scalarization

Map any 32-byte string `b` to a valid secp256k1 private key (normative, single algorithm):

```text
scalarize(b):
  x = b interpreted as integer big-endian
  if x == 0 or x >= n:  // n = secp256k1 order
    return scalarize(SHA256("btcgiftcard/v1/scalar" || b))
  return x
```

If the rehash is still invalid, repeat: `b' = SHA256("btcgiftcard/v1/scalar" || b)` and apply the same rule (loop until valid). In practice CSPRNG/HKDF/Argon2 outputs almost never hit this branch.
#### 4.2.3 Claim private key — no passphrase

```text
claim_priv = scalarize(HKDF-SHA256(
  ikm = claim_secret,
  salt = empty,
  info = "btcgiftcard/v1/claim",
  len = 32
))
```

- Package `claim.kdf` = `{ "name": "hkdf-sha256", "info": "btcgiftcard/v1/claim" }`  
- No alternative “raw secret as privkey” path.

#### 4.2.4 Claim private key — passphrase required

```text
claim_priv = scalarize(Argon2id(
  password = passphrase (UTF-8, NFC-normalized),
  salt     = claim_secret,          // 32-byte salt; in the URL/package
  m        = 65536,                 // KiB → 64 MiB
  t        = 3,
  p        = 1,
  outLen   = 32
))
```

- Package `claim.kdf` = `{ "name": "argon2id", "m": 65536, "t": 3, "p": 1, "out": 32 }`  
- Passphrase is **never** stored in any package variant.  
- Passphrases are **always site-generated**: 4 words from the EFF large wordlist (7776 words, 4 × log2(7776) ≈ 51.7 bits), CSPRNG with rejection sampling, lowercase, single-space separated, NFC-normalized. Human-chosen passphrases are removed from the product (2026-07-12 decision; crack economics in the send-mechanism design doc). Claim input is case-insensitive and whitespace-collapsed before NFC; on commitment mismatch the client retries once with the raw NFC-only input so pre-existing human-passphrase gifts stay claimable.
- **Terminology:** “passphrase required” — not “passphrase-wrapped.” The claim secret still appears in the URL fragment; the passphrase is a second factor (KDF gate), not encryption that removes secret material from the link.

#### 4.2.5 Claim public key `C`

- `C` = x-only pubkey corresponding to `claim_priv` (BIP340).  
- If the library produces an even-Y / odd-Y convention issue, follow BIP340: store and use the **x-only** key; signing must match BIP340/BIP341 script-path rules.

#### 4.2.6 Expiry key `R`

Depends on expiry policy (**§4.3**), not §5.

| Policy | How `R` is chosen |
|--------|-------------------|
| `refund_self` | Client generates `refund_secret` (32-byte CSPRNG) → `refund_priv = scalarize(HKDF-SHA256(ikm=refund_secret, salt=empty, info="btcgiftcard/v1/refund", len=32))` → `R` x-only. `refund_secret` goes only in **Sender full backup**. |
| `donate_project` | `R` = x-only pubkey from release config: fixed testnet4 project key **or** `xpub` + path `m/86'/1'/0'/0/0` (Taproot-style account; network coin type 1 for test). Path is **mandatory** if xpub is used. Same `R` for all v1 donate gifts is allowed; privacy tradeoff disclosed (§11.3). |
| `custom` | Sender supplies either (a) compressed or x-only **pubkey** → normalize to x-only `R`, or (b) `xpub` + **explicit derivation path** chosen at create (default `m/86'/1'/0'/0/0`). **Not** an arbitrary Bitcoin address: addresses are not tapscript keys. Custom means “this key controls post-`T` spend”; destination is chosen at recovery time. |

### 4.3 Expiry policies (`R`)

At create time the **sender chooses** one policy:

| Policy ID | Meaning | Who holds spend key for `R` | Backup UX |
|-----------|---------|------------------------------|-----------|
| `refund_self` | After CSV matures, sender may recover | Sender (`refund_secret` in full backup) | **Mandatory** full backup download before “Ready to gift” |
| `donate_project` | After CSV matures, project cold key may recover | Project cold key (release config) | Warning: unclaimed → project may sweep after ~T; website still cannot |
| `custom` | After CSV matures, holder of supplied `R` may recover | Whoever has the matching private key | Sender responsible; no project recovery |

**Defaults:**

- Policy: `refund_self`  
- `T`: **12_960 blocks** (~90 days at 144 blocks/day), selectable presets **4_320 / 12_960 / 25_920** (~30 / 90 / 180 days). UI shows “~N days (M blocks)”.  
- BIP68 block-based value must fit type encoding (these presets do).

**Donate is opt-in** (not default). Product must not default to short `T` + donate.

### 4.4 NUMS internal key (frozen for v1)

**Construction:**

```text
h0 = SHA256(UTF-8("BTCGiftcard/v1/NUMS"))
// Find x-only point with defined lift (BIP340 lift_x). If h0 is not a valid x-coordinate,
// try h_i = SHA256(h_{i-1}) for i = 1,2,... until lift_x succeeds.
NUMS_XONLY = first valid x in that sequence
NUMS_INTERNAL = lift_x(NUMS_XONLY)   // used as Taproot internal key; no provable dlog
```

Implementations **must** compute and pin the resulting 32-byte `NUMS_XONLY` in tests (golden vector). Once first release ships, this value is immutable for package `v: 1`.

**Appendix A** (filled at first green CI): record hex `NUMS_XONLY` and iteration count `i`.

### 4.5 Funding

- Pay the Taproot address with one or more standard payments.  
- **Multiple UTXOs** to the same gift address are supported; each UTXO has its **own** confirmation count and **own** BIP68 age.  
- Reject create UX amounts below **min gift** (§8). Chain may still receive arbitrary amounts; claim rules handle under/over funding (§8.1).

---

## 5. Gift package format

The gift package is the **canonical recoverable artifact**. The claim URL is a convenience encoding of a subset of it.

### 5.1 Design rules

- Versioned, portable, printable  
- Sufficient to claim **or** refund **without the website** when the correct variant is used  
- Claim secret **must not** be sent to the website process — with one carve-out: a **passphrase-committed** `share_card` (i.e. `claim.passphrase_required: true`) MAY be transiently relayed via `POST /api/send` for email delivery. It is never persisted and never logged; the passphrase (the second factor the address commits to) is never sent to any server.  
- Prefer QR + text + JSON download  

### 5.2 Common fields (all variants)

```jsonc
{
  "v": 1,
  "network": "testnet4",
  "created_at": "2026-07-11T12:00:00Z",

  "script": {
    "descriptor": "tr(<NUMS_XONLY>,{pk(<C>),and_v(v:older(<T>),pk(<R>))})",
    "nums_xonly": "<64 hex chars>",
    "T": 12960,
    "C_xonly": "<64 hex>",
    "R_xonly": "<64 hex>",
    "address": "tb1p...",
    "script_pub_key": "<hex>"
  },

  "claim": {
    "passphrase_required": false,
    "kdf": { "name": "hkdf-sha256", "info": "btcgiftcard/v1/claim" }
    // if passphrase_required:
    // "kdf": { "name": "argon2id", "m": 65536, "t": 3, "p": 1, "out": 32 }
  },

  "expiry_policy": {
    "type": "refund_self",
    "T_blocks": 12960,
    "human": "~90 days after each UTXO confirms (per-input CSV)"
  },

  "amount_expected_sats": 100000,
  "memo": "Happy birthday",

  "recovery": {
    "claim_url_template": "https://<origin>/c#<PAYLOAD>",
    "offline_checklist": "see §5.5"
  }
}
```

### 5.3 Export variants (normative)

| Variant | `claim_secret` | `refund_secret` | Intended use |
|---------|----------------|-----------------|--------------|
| **share_card** | **Required** (base64url in field `claim.secret_b64url`) | Absent | Give to recipient |
| **sender_full_backup** | **Required** | **Required** if `refund_self`; else absent | Sender vault; never share |
| **sender_watch_only** | Absent | Absent | Track funding only |

**Additional required fields by variant:**

```jsonc
// share_card / sender_full_backup
"claim": {
  "secret_b64url": "<32 bytes base64url unpadded>",
  "passphrase_required": false,
  "kdf": { ... }
}

// sender_full_backup + refund_self only
"refund": {
  "secret_b64url": "<32 bytes base64url unpadded>",
  "kdf": { "name": "hkdf-sha256", "info": "btcgiftcard/v1/refund" },
  "R_xonly": "<must match script.R_xonly>"
}
```

**Integrity:** Client should verify that `C_xonly` derives from `claim_secret` (+ passphrase if required) and `address` matches descriptor before showing “Ready to gift.”

### 5.4 Claim URL

```text
https://<host>/c#<payload>
```

**Payload (normative):**

| Form | Meaning |
|------|---------|
| `g1.<share_card_b64url>` | Full gift link: base64url (unpadded) of the `share_card` JSON (§5.3). Self-sufficient — card display fields, `script` public fields, and claim secret. **The v1 product emits and accepts only this form.** |
| `g1.<share_card_b64url>.<passphrase_b64url>` | Optional third dot-separated segment: base64url of the UTF-8 NFC passphrase. Emitted **only** by the QR rendering for self-sent passphrase-opt-in gifts (single-scan in-person handoff, client-side scan only — never emailed, never in copy/share links). Dots don't occur in base64url so parsing stays unambiguous; two-segment links are unchanged. Parsers (`/c`, `/recover`, create self-check) accept and ignore/consume the third segment; `/api/send` rejects it outright. On a failed derive from the embedded passphrase the claim page falls back to the manual prompt. |
| `v1.<secret_b64url>` | **Reserved.** No passphrase; secret is IKM for HKDF claim path |
| `v1.p.<secret_b64url>` | **Reserved.** Passphrase required; secret is Argon2 **salt** |

- `v1.` / `v1.p.` short forms are **reserved, not live**: the v1 product never emits them, and the claim page rejects them with guidance to open the full `g1.` link. They carry no `script` fields, so a site-independent claim is impossible from them alone; they become claimable only in a build that implements chain discovery (below).
- Secret material **only** in the URL **fragment**, never query string  
- Do not put fragment into `history`, analytics, or API query params  
- Claim page may need `script` parameters (address, `T`, `C`, `R`, nums) from: (1) the `g1.` payload, or (2) watch-only package / QR scanned at claim, or (3) chain discovery by deriving address client-side from secret alone  

**Address recovery from URL alone:** With only `claim_secret` (± passphrase), client can recompute `C` but **not** `R` or `T`. Therefore:

- **Share card JSON/QR** (or extended fragment) **must** include `script` public fields (`nums_xonly`, `T`, `C_xonly`, `R_xonly`, `address`) for offline/site-down claim.  
- Minimal fragment carries **only** secret + passphrase flag — reserved for a future build with a companion watch template or chain discovery; offline-capable share **must** use full `share_card` package (§5.3).  
- v1 product: the share artifact is the **full `g1.` link / share_card** (file + QR of JSON or of claim URL **plus** download of share_card). Short links are not emitted or accepted in v1.

**Recommended v1 share UX (send mechanism, 2026-07-12):** Primary = Web Share API (`navigator.share({url})`, shown when `navigator.canShare?.({url}) ?? !!navigator.share`) — covers AirDrop/iMessage/WhatsApp/Signal/anything installed, fragment survives into the OS share sheet, zero server involvement. Fallback = copy-link button (mandatory: Firefox desktop and desktop-Linux Chromium lack Web Share). Optional dedicated buttons: WhatsApp `https://wa.me/?text=<urlencoded link>` and Messages `sms:?&body=<urlencoded link>` (iOS-compatible ampersand form) — the only safe per-messenger prefill links. Explicitly not offered: Telegram, X, Messenger (each leaks the link to the platform), Nostr (niche). One QR = the `g1.` claim URL (three-segment variant for self-sent opt-in gifts only); human also gets the `g1.` link as text. Tier 2 = `/api/send` email relay (§10.1).

**HTTP headers (claim app):**

- `Referrer-Policy: no-referrer`  
- No third-party analytics on claim routes  
- CSP strict (`default-src 'self'`; `connect-src` indexer allowlist only)

### 5.5 Offline recovery checklist

v1 **must** ship:

1. **Downloadable `share_card` + `sender_full_backup` JSON** at create  

Deferred to **v1.1** (§14.4):

2. **Static offline claim page** (single HTML+JS bundle, no secrets baked in) distributed with the app release and/or generated at create  
3. **Written steps** for descriptor + key import into a named wallet (Sparrow recommended) for script-path spend, with version note  

**Success criterion §14.3.2** means: using (1)+(2) against a public testnet4 indexer, claim works with **network offline from the project origin** (block project domain). It applies when (2) ships (v1.1).

Refund offline: import `sender_full_backup`, wait CSV, spend expiry leaf — signing tooling lands in v1.1 (§14.4).

---

## 6. Lifecycle model

States are **derived** from chain data + which secrets the local client holds. They are **not** operator-assigned.

### 6.1 Per-UTXO predicates

For each outpoint paying the gift `script_pub_key`:

| Predicate | True when |
|-----------|-----------|
| `in_mempool` | Unconfirmed tx currently in mempool |
| `confs >= 1` | Funding confirmed ≥1 |
| `confs >= 3` | Funding confirmed ≥3 |
| `csv_mature` | BIP68 `older(T)` satisfied for this input (relative to this UTXO’s confirmation) |
| `spent` | Outpoint spent (claim or expiry or other) |
| `spend_kind` | `claim` / `expiry` / `unknown` if spent |

### 6.2 Gift-level UI labels (aggregates)

| Label | Rule |
|-------|------|
| `CREATED` | Address generated; no chain payment seen |
| `AWAITING_FUNDS` | Watching; no UTXO ≥1 conf and no mempool payment |
| `FUNDED_UNCONF` | ≥1 mempool payment; **zero** UTXOs with `confs >= 1` |
| `PARTIALLY_CLAIMABLE` | Some UTXOs `confs >= 1` & unspent; others pending/absent |
| `CLAIMABLE` | ≥1 unspent UTXO with `confs >= 1`; none of those yet `csv_mature` required for claim (claim always allowed when confs≥1) |
| `SETTLED_BADGE` | **Label only:** every currently unspent gift UTXO has `confs >= 3` if total value ≥ 1e6 sats; else all unspent have `confs >= 1` |
| `CSV_OPEN` | ≥1 unspent UTXO with `csv_mature` (expiry path live; claim still live) |
| `CLAIM_BROADCAST` | Local client broadcast a claim spend still unconfirmed |
| `CLAIMED` | All previously seen gift value spent via claim (or no unspent gift UTXOs and last spend was claim) |
| `RECOVERED` | All value spent via expiry path |
| `MIXED_SPENT` | Some UTXOs claimed, some recovered, or residual unspent — show per-UTXO detail |
| `FAILED_FUNDING` | Mempool funding disappeared without conf; no confirmed UTXOs → treat as `AWAITING_FUNDS` and warn |

**Claim enablement (product):** enabled iff ∃ unspent UTXO with `confs >= 1` and client can sign claim path. **Never** enable on 0-conf only.

### 6.3 Invariants

1. At most one successful spend per gift outpoint (consensus).  
2. Must not present gift as shareable/claimable when only `FUNDED_UNCONF`.  
3. Website cannot force state transitions; chain is source of truth.  
4. After an outpoint is spent, both paths are moot for that outpoint.  
5. Double-claim: second spend fails on-chain; UI detects spent outpoints.  
6. After `csv_mature`, claim and expiry **race**; UI for refund must refresh UTXO set immediately before sign/broadcast.

### 6.4 Confirmation policy (fraud resistance)

| Event | Requirement |
|-------|-------------|
| Show “Paid — you can send the gift” | ≥1 gift UTXO with **≥1** confirmation |
| Show “Settled” badge | Per §6.2 `SETTLED_BADGE` |
| Allow claim control | ≥1 unspent UTXO with **≥1** conf |
| 0-conf claim | **Forbidden** |

RBF: unconfirmed replaceable funding stays non-claimable.

**Reorgs:** Before sign/broadcast, re-fetch UTXOs. If funding is reorged out, abort and show failure. Residual risk disclosed in §11.3.

---

## 7. User flows

### 7.1 Create (sender)

1. Land on create page (no account).  
2. Enter amount (sats and BTC). Enforce min gift for **expected** amount.  
3. **Tip (default 3%, editable):** pre-fill project tip at **3%** of gift amount. Sender may edit % or absolute sats, or set **0**. Tip is never part of the gift vault (§8.1).  
4. Optional memo (local/package only).  
5. Choose expiry: `T` preset + policy (`refund_self` / `donate_project` / `custom`).  
6. **Delivery choice** — “How will you deliver it?”: *I'll share it myself* (optional generated-passphrase toggle) or *Email it for them* (passphrase forced, generated immediately; `refund_self` default). A gift created without a passphrase can never use email delivery (the address commitment is immutable once funded); the reverse is fine. The 4 generated words are shown at create and re-shown at share; they are never stored in any package.  
7. Client generates secrets, computes descriptor/address; show QR + gift address + amount **and** separate tip payment if tip > 0.  
8. **Funding method** (§7.1.1): already have BTC **or** buy BTC (on-ramp / guided exchange) **or** LN→chain when enabled.  
9. Sender completes funding; if tip > 0, pay tip to project address (extra output **or** separate payment — §8.1).  
10. Watch until ≥1 conf on ≥1 **gift** UTXO → “Ready to gift.” Tip confirmation is independent and must not block claimability of a funded gift.  
11. **Force** download/copy of:
   - `share_card`  
   - `sender_full_backup` if `refund_self`  
12. Guidance: **the share package / link is money**; passphrase is a second factor, not a reason to treat the link as public.

#### 7.1.1 Funding methods (including buy BTC)

| Method | Behavior |
|--------|----------|
| **I already have Bitcoin** | Show gift address + QR; optional BIP21; watch chain |
| **Buy Bitcoin now** | Third-party **on-ramp** with `destination = gift address` (and amount ≈ gift + buffer). Partners: Coinbase Onramp, MoonPay, Ramp, Stripe-class, or aggregator — see [docs/WALLETS-AND-ONRAMP-2026.md](./docs/WALLETS-AND-ONRAMP-2026.md). Feature-flagged; geo-limited by partner |
| **Buy on Strike / Kraken / Gemini / Coinbase app** | **Guided** deep link: buy BTC there → withdraw/send to gift QR (no assumption of embed API) |
| **Lightning → chain** | When swap ADR on: LN payment into gift UTXO via atomic swap |

**Rules:**

- We **never** take card details or custody purchased BTC.  
- On-ramp partner performs KYC/payment; disclose fees and that identity checks are theirs.  
- Optional tiny backend **only** for partner session tokens if required — **no** gift secrets/keys.  
- v1 testnet: faucet + “already have BTC”; buy UI may be stubbed until mainnet partner approval.

### 7.2 Claim (recipient)

**Audience default:** inexperienced with Bitcoin. Claim UX is optimized for **one clear path to any receive destination**, including **custodial exchanges** (Coinbase, Gemini, Kraken, etc.) and simple mobile apps. Protocol remains: spend gift UTXO → user-supplied address. Detailed copy and guide structure: [docs/CLAIM-UX.md](./docs/CLAIM-UX.md).

#### 7.2.1 Flow

1. Load `share_card` and/or claim URL; read secret **only** in-page from fragment or file.  
2. If `passphrase_required`: simple passphrase prompt; derive via Argon2id; never send passphrase to network.  
3. Derive `claim_priv` / verify `C_xonly` matches package.  
4. Fetch UTXOs via user-configurable indexer (default: public testnet4 Esplora).  
5. If unfunded / only unconfirmed: plain-language status; no false success.  
6. **Destination chooser** (§7.2.2) — not a blank advanced form as the first screen.  
7. Guided steps for the chosen destination (exchange or wallet), then **paste receive address** (or LN invoice when enabled).  
8. Validate address: correct **network**, standard Bitcoin script types allowed as **outputs** (legacy / nested / segwit / taproot receive addresses).  
9. Select UTXOs (default: all confirmed unspent); estimate fee; show **net you receive**; confirm with plain button (“Send my gift”).  
10. Sign Taproot script-path spend(s) for claim leaf in-browser.  
11. Broadcast via selected backend.  
12. Success: txid + explorer link + **destination-specific “what happens next”** (e.g. exchange confirmation delays).

#### 7.2.2 Destination chooser (required UX)

Primary screen after “gift is ready”: **“Where should we send it?”**

**Recommended for you (device-aware, always shown first):**

| Context | Default recommendation |
|---------|------------------------|
| **Phone** | **Phoenix** (primary), Muun / BlueWallet — 2026 beginner self-custody ([WALLETS-AND-ONRAMP-2026](./docs/WALLETS-AND-ONRAMP-2026.md)) |
| **Desktop** | **Sparrow** **or** “Continue on phone” (QR of claim URL built **in-browser**) |
| **Small amount + LN enabled** | Prefer **Lightning** receive on a self-custody LN wallet when suitable |

Tone: encourage self-custody; **never** disable exchanges or paste-any-address. Full rules: [docs/CLAIM-UX.md](./docs/CLAIM-UX.md).

**All options (same page, below recommendation):**

| Category | Examples | Behavior |
|----------|----------|----------|
| **⭐ Self-custody (encouraged)** | Phoenix, Muun, Sparrow, BlueWallet, … | Guided setup + backup reminder + paste address or LN invoice |
| **⚡ Lightning** | When §9 enabled | Invoice / LNURL / LN address → reverse swap claim; fallback to on-chain |
| **🏦 Exchange / custodial** | Coinbase, Gemini, Kraken, Cash App, … | Steps: Receive/Deposit **BTC** → network **Bitcoin** → copy → paste |
| **Paste any Bitcoin address** | Hardware, any app | Address field; network validation |
| **Help me choose** | 2–3 questions | Device + preference → ranked recommendation |

- Guides in maintainable `destinations.json` (no API keys).  
- **Never** exchange passwords, withdrawal-capable API keys, or OAuth into brokerages.  
- **Never** hold coins while the user finishes signup.  
- After claim to a custodial service, **their** custody/KYC rules apply — disclose on review + success.  
- Calm self-custody nudge when user picks an exchange (not a blocker).

#### 7.2.3 Ease requirements

- Mobile-first; one primary CTA per step; progress “Step N of M.”  
- Device-aware **Recommended for you** card for complete newbs.  
- Jargon (UTXO, Taproot, PSBT) only under **Advanced**.  
- Fiat estimate optional beside BTC amount.  
- Warn when net may be below typical **exchange minimum deposits**.  
- Claim **once** messaging on success.  
- Testnet: same shell; exchange guides mainnet-oriented; testnet wallets for e2e.

#### 7.2.4 API integrations (normative stance)

| Integration | v1 stance |
|-------------|-----------|
| Paste address + local validation | **Required** |
| Esplora/Electrum (user-selectable) | **Required** |
| LN **swap** provider API (client-initiated) | **When LN claim enabled** (§9 ADR) |
| Fiat price API | Optional display |
| Wallet deep links / store links / `bitcoin:` URI | Encouraged |
| Exchange OAuth / “Connect Coinbase” / deposit APIs with **our** keys | **Forbidden** |
| Third-party QR APIs that receive claim URLs | **Forbidden** (generate QR in-browser) |

Rationale: exchange APIs add phishing/liability and little UX over “copy deposit address”; they risk looking custodial. See CLAIM-UX §6.

**Advanced (collapsed):** per-UTXO control, manual feerate, descriptor view, offline package tools.

### 7.3 Expiry recovery

1. For each unspent UTXO with `csv_mature`, holder of `R` may spend.  
2. Load `sender_full_backup` (or project cold tooling / custom key).  
3. Re-fetch UTXOs (race with claim).  
4. Build expiry-path spend(s) to chosen destination; broadcast.  

Product UI: “Recover unclaimed gift” for senders with backup. Project donate sweeper is **offline/cold**, never a hot website admin button.

---

## 8. Amounts, fees, dust

| Parameter | v1 default | Notes |
|-----------|------------|--------|
| Min gift (create UX) | **100_000 sats** | Expected amount; tunable |
| Max gift | None in protocol | Optional UI warning |
| Protocol fee | **None** | Not enforceable offline; not in script |
| **Project tip** | **Default 3% of gift, editable** | See §8.1 |
| Claim fee | **Paid by claimant** from spent UTXO(s) | Show net before confirm |
| Expiry fee | Paid by recoverer | Same |

### 8.1 Project tip (default 3%, editable)

**Product rule:** At create, the UI pre-fills a **project tip of 3%** of the intended gift amount. The sender can **edit** the tip (percent and/or absolute sats) or set it to **0**.

| Rule | Detail |
|------|--------|
| Default | `tip_sats = floor(gift_amount_sats * 0.03)` (normative: floor; unit tests pin examples) |
| Editable | Percent control and/or sats field; live dual update |
| Zero allowed | Explicit “No tip” / set 0 — never blocked |
| Destination | Published project on-chain address (and optional LN) from **release config** — not a hot key that can spend gifts |
| Separation | Tip **must not** be mixed into the gift Taproot script, claim path, or share_card spend authority |
| Payment | Prefer **one funding tx** with two outputs (gift address + tip address), or two clear payments labeled in UI |
| Disclosure | Copy: “Optional support for the open-source project (default 3%). You can change or remove it. This is separate from the gift.” |
| Offline / third-party clients | Tip is **UX default only**, not a consensus rule — alternate clients may omit it |
| Package | Optional field `tip_sats_suggested` / `tip_paid_sats` on sender backup for records only — never required to claim |
| Privacy | Tip links sender amount to project address on-chain; disclose if relevant |

**Non-goals for tip:**

- Do not reduce the gift amount silently to “hide” a fee  
- Do not require tip for “Ready to gift”  
- Do not put tip keys or project spend authority in the website process beyond publishing a receive address  

### 8.2 Under / over funding & dust

| Case | Behavior |
|------|----------|
| Confirmed total **<** dust / not fee-viable | Show “Unclaimable amount — needs more funds or fee spike wait”; do not pretend success |
| Confirmed total **<** `amount_expected_sats` but spendable | Allow claim with **warning** (“less than sender indicated”) |
| Confirmed total **>** expected | Allow claim of all or selected UTXOs; show actual total |
| Multiple UTXOs | Default spend all confirmed unspent; Advanced allows subset |
| Change | **Prefer no change** (send `value - fee` to destination). If change would be dust, either bump fee to consume or abort with message — **never** leave dust to an address the claimant does not control without disclosure. v1 default: **single output**, fee = input_sum - destination_amount chosen by fee estimator |
| Residual UTXO after partial claim | Gift stays `MIXED_SPENT` / still claimable for remainder |

Refuse **create** below min expected. Do not create IOUs or pooled balances.

Fee estimation: backend feerate API; manual feerate allowed; default conservative.

---

## 9. Lightning (optional rails; ADR-gated)

### 9.1 Principles

- Vault remains on-chain Taproot UTXO.  
- Swaps must be **atomic** from the user’s perspective (documented failure → user retains control).  
- Claim secret is never given to a swap provider as a custodial hold.  
- **v1 success criteria do not include LN** until a swap ADR is merged.

### 9.2 Required ADR contents (before enabling flag)

1. Exact provider(s) and testnet4 support reality  
2. Scripts and key handover for reverse submarine swap  
3. Who holds swap refund keys; timeout vs gift `T`  
4. Failure modes: timeout, abort, provider down — where sats end up  
5. Privacy disclosure text  
6. Multi-UTXO behavior  

### 9.3 Fund via LN (sender) — post-ADR

LN payment → swap → on-chain payment to gift address. Same vault model.

### 9.4 Claim via LN (recipient) — post-ADR

Must not strand funds with website process. Typical pattern: client spends claim path into swap lock under **client-held** refund key with timeout; not “provider holds claim_secret.”

---

## 10. Operator surface & infrastructure

### 10.1 Allowed components

| Component | Role |
|-----------|------|
| Static web app (create + claim) | Client-side crypto, UX |
| Optional lightweight API | Rate-limit public proxy to Esplora; **no secrets** |
| `/api/send` email relay (Cloudflare Worker) | Send-and-forget relay of a passphrase-committed `share_card` link to a recipient email. Transient only: no DB, no resend, no log line containing the link; ephemeral rate-limit counters + 60 s funding-check cache are the only state. Requires Turnstile + funded-address check (recomputed server-side). |
| Public chain indexers | Balance, UTXO, broadcast |
| CDN / host | Static assets only |
| Project cold key (offline) | `donate_project` expiry spends only; never in web host env |

### 10.2 Forbidden

- Database of claim secrets or private keys  
- “Resend gift email” that regenerates secrets  
- Hot admin “seize gift”  
- Mixing/pooling user funds  
- Loading donate/refund keys into website process  

### 10.3 Logging

- **Never** log URL fragments, claim secrets, raw gift packages, or full claim URLs  
- Prefer minimal access logs for `/c`  
- No analytics SDKs on claim pages in v1  

### 10.4 Privacy defaults

- User can set custom Esplora/Electrum endpoint — v1: documented `localStorage` override (`gb_esplora_base`, custom hosts also need a CSP `connect-src` entry); settings **UI** is v1.1 (§14.4)  
- Document Tor usage  
- Do not force all broadcasts through project domain without alternative  

### 10.5 Default chain backends (v1 testnet4)

Pin in release config (update if infrastructure moves):

| Purpose | Default (placeholder — set at implement) |
|---------|------------------------------------------|
| Esplora HTTP | Document chosen public testnet4 Esplora base URL |
| Explorer tx links | Document chosen testnet4 explorer |
| Broadcast | Same Esplora `/tx` or equivalent |

---

## 11. Threat model

### 11.1 Assets

- Gift UTXO value  
- Claim secret / passphrase  
- Refund secret  
- Sender/recipient metadata (memo, IP if logged)

### 11.2 Attackers & mitigations

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Stolen claim link | Theft of gift | Passphrase second factor; treat as cash; fragment-only; education |
| Phishing claim site | Secret theft | Offline package; offline HTML; reproducible builds |
| Malicious/compromised claim JS | Mass theft | SRI, CSP, reproducible static build, offline HTML |
| Website process malice | Theft | No keys on server |
| Project cold key compromise | Theft of **unclaimed donate-policy** gifts after CSV | Cold storage; optional multisig later; disclose donate risk |
| Sender keeps claim secret | Sender can reclaim before/during recipient claim | Expected bearer property; full backup contains claim secret by design |
| Sender double-spend funding | Fake gift | ≥1 conf before share |
| Post-`T` claim vs refund race | Refund fails if claim first | Refresh UTXOs; disclose race |
| 1-conf reorg | Apparent gift disappears / claim fails | Re-verify; disclose residual risk; settled badge at 3 conf for large |
| Mempool front-run of hashlock | N/A | Script is `pk(C)`, not bare hashlock |
| Email unfurl bots | Hit `/c` without secret | Fragment not sent to server |
| Lost link / lost backup | Permanent loss | Warnings; refund path if backup kept |
| Swap provider failure | Strand/theft if mis-integrated | ADR gate; atomic design |
| Chain analysis | Link funder ↔ claimer | Inherent; minimize logs |
| Static donate `R` clustering | All donate gifts visible as set | Disclose; optional per-gift derive later |
| XSS / extension malware | Key theft in browser | CSP; offline path for large amounts |

### 11.3 Residual risks (must disclose in product copy)

1. Anyone with the share package / link (+ passphrase if set) can take the money **until the UTXO is spent** — including after `T`.  
2. After `T`, refund/donate and claim **race**; there is no exclusive recovery window.  
3. Sharing as “ready” at **1 confirmation** still has residual reorg risk; large gifts should wait for the settled badge (3 conf).  
4. If you lose the link and the sender used `donate_project` or lost the refund backup, funds may be unrecoverable for you.  
5. Website compromise can steal secrets from users who claim online — use offline package for high value.  
6. Bitcoin amounts and addresses are public on-chain.  
7. Passphrase does **not** remove the secret from the link; it only adds a second factor.  
8. `donate_project` grants the project cold key post-`T` authority (not the website hot path).  
9. Claiming to Coinbase/Gemini/Kraken/etc. means **those platforms** then hold the BTC under their terms — the gift protocol only delivers on-chain to the address you paste.

---

## 12. UX principles

1. **Cash metaphor** — “This package/link is money,” not “your account balance.”  
2. **One primary action** per screen (Create / Pay / Share / Claim).  
3. **Net amount** always shown before claim.  
4. **Progressive disclosure** — descriptors, per-UTXO, raw txs under Advanced.  
5. **No false finality** — unconfirmed ≠ ready; post-`T` ≠ claim dead.  
6. **Beautiful, calm, modern** — high trust visual design.  
7. **Accessibility** — keyboard, contrast, screen readers on critical paths.  
8. **Testnet clarity** — persistent banner: “Bitcoin testnet4 only — no real value.”  
9. **Inexperienced-first claim** — device-aware recommendation + guides ([docs/CLAIM-UX.md](./docs/CLAIM-UX.md)).  
10. **Encourage self-custody, allow everything** — recommend phone/desktop wallets; exchanges and paste-any remain one tap away.  
11. **Lightning when enabled** — preferred for suitable small/fast claims; on-chain always available.

### 12.1 Copy requirements

- Delivery choice explains the generated 4 words as a second factor sent over a different channel ("Now text or tell them these 4 words — the email alone can't claim the gift"); email confirmation says handed to the mail system, never "delivered"  
- Explain expiry policy + post-`T` race in plain language at create  
- Claim: “Where should we send it?” + fee + net + address double-check  
- Custodial destinations: “After it arrives, that company’s rules apply”  
- Donate policy: project may recover after ~T  
- Success: exchange confirmation wait; claim only once  

---

## 13. Security implementation requirements

| Requirement | Detail |
|-------------|--------|
| CSPRNG | `crypto.getRandomValues` or OS CSPRNG offline |
| No secret in query | Enforced in URL builder tests |
| No secret to API (claim flow) | Fragment never appended to fetch URLs in the claim flow. The send flow's §5.1 carve-out applies to /api/send only. |
| Network check | Refuse non-testnet4 addresses on v1 build |
| Dependency hygiene | Pin versions; minimal crypto libs |
| Reproducible builds | Document how to verify static assets |
| SRI | On any third-party scripts (prefer zero) |
| CSP | `default-src 'self'`; `connect-src` indexer allowlist; `script-src`/`frame-src` additionally allow `https://challenges.cloudflare.com` (Turnstile on the send form — site-wide because SvelteKit CSP is one config) |
| Passphrase | Never stored; never transmitted |
| Golden vectors | NUMS, sample claim_secret→address, descriptor |

---

## 14. v1 scope (testnet4)

### 14.0 Network pin

| Field | Value |
|-------|--------|
| Network name | **Bitcoin testnet4** |
| Package `network` string | `testnet4` |
| Address HRP | `tb` (bech32m Taproot) |
| Coin type (xpub paths) | `1` |

If testnet4 infrastructure is unavailable in an environment, development may use **regtest** for CI; package network field must be `regtest` there and not mixed with testnet4 vectors.

### 14.1 In scope

- Create gift (client keygen, Taproot address, QR)  
- Fund watch + confirmation gates  
- `share_card` + `sender_full_backup` + `sender_watch_only`  
- Claim on-chain with **destination chooser** + exchange/wallet guides + paste address (multi-UTXO aware)  
- Expiry recovery for `refund_self`: **status check + recovery instructions** (signing/broadcast → v1.1, §14.4)  
- Optional passphrase (Argon2id path)  
- Public testnet4 indexer integration (pluggable)  
- LN module **interfaces** behind default-**off** feature flag (no success requirement)

Moved to **v1.1** (§14.4): refund signing/broadcast, `donate_project` + `custom` policy wiring, static offline claim HTML kit, indexer-override UI.

### 14.2 Explicitly deferred

- Mainnet  
- LN fund/claim without approved ADR  
- Mobile native apps  
- Multiparty multisig claim / donate  
- PayJoin / coinjoin  
- Hardware wallet signer (nice follow-up for refund)  
- Fiat on-ramps  
- Covenant-locked expiry destinations (CTV)  

### 14.3 Success criteria (v1)

Numbering is frozen (code and tests cite §14.3.n). Criteria marked **(v1.1)** apply when their §14.4 deliverable ships.

1. Create → fund (testnet4 or regtest) → claim on-chain works end-to-end with site.  
2. **(v1.1)** Same gift claimable via **share_card + offline claim HTML** with project origin blocked.  
3. Automated test: claim secret never appears in simulated server request URLs/bodies **in the claim flow** (the send flow relays the share_card under the §5.1 carve-out and is excluded).  
4. Unconfirmed-only gift cannot be marked claimable.  
5. **(v1.1)** After `T` (short `T` on regtest), refund path recovers to sender when claim did not win the race.  
6. Network validation rejects mainnet addresses.  
7. Golden vector: fixed `claim_secret` → fixed address with frozen NUMS/tree.  
8. **(v1.1)** Post-`T`, both claim and refund still attempted in tests; first spend wins.

### 14.4 v1.1 milestone (committed, post-v1)

Moved out of v1 core by the 2026-07-12 review — still normative deliverables (tracked in [TODO.md](./TODO.md)), just not v1 blockers:

| Deliverable | Detail | Re-activates |
|-------------|--------|--------------|
| **Static offline claim HTML kit** | §5.5 items 2–3: single-file claim page + written wallet-import steps | §14.3.2 |
| **Refund / expiry signing + broadcast** | `refund_self` spend of the CSV leaf (§7.3). The custom leaf needs a manually built witness — library auto-finalize does not cover it. v1 recover page stays status-check + instructions | §14.3.5, §14.3.8 |
| **`donate_project` + `custom` policy wiring** | Project key from release config (§4.3); UI selection at create | — |
| **Indexer-override UI** | Settings screen over the existing `localStorage` override + CSP `connect-src` handling (§10.4) | — |

No package-format or script changes are implied by this milestone; anything that would alter packages or scripts still requires an ADR first (§22 rule).

---

## 15. Suggested technical stack (non-binding)

| Layer | Suggestion |
|-------|------------|
| UI | Static SPA (Svelte/React/Vue) or multi-page static |
| Bitcoin crypto | Library with Taproot + miniscript/descriptors (bitcoinjs / rust-bitcoin WASM / BDK) |
| Chain I/O | Esplora HTTP (testnet4), pluggable |
| Hosting | Static host + optional tiny relay |
| LN swaps | Adapter interface only until ADR |

**Must preserve:** all keygen and signing in client.

---

## 16. Testing requirements

| Type | Cases |
|------|--------|
| Unit | HKDF/Argon2 derivation, scalarize, descriptor address match, URL payload encode/decode, min amount, network validation, NUMS golden |
| Property | Address from package == address at create; C matches secret |
| Integration | Fund; claim; double-claim fails; multi-UTXO partial claim; refund after short T; claim wins race after T |
| Security | Fragment not in outbound requests; CSP; no secret in localStorage unless user-initiated save |
| E2E | Create → pay → claim; offline HTML claim (v1.1, §14.4); refund path (v1.1, §14.4) |

Prefer **regtest** for CI; **testnet4** for manual QA.

---

## 17. Documentation deliverables (with code)

- This `SPEC.md`  
- `README.md` — run locally, testnet4 faucet links, disclaimer  
- `docs/COMPETITIVE-LANDSCAPE.md` — prior-art research (maintain before mainnet)  
- `docs/DEMAND-AND-DECENTRALIZATION.md` — demand, why the gap, decentralized UI delivery  
- `docs/CLAIM-UX.md` — inexperienced claim flow; exchange + wallet guides  
- `docs/WALLETS-AND-ONRAMP-2026.md` — 2026 wallet recs + sender buy-BTC on-ramp  
- `docs/MONETIZATION.md` — tips and income without custody  
- `TODO.md` — implementation + improvements + watch + delivery + monetization + claim UX  
- In-app Help: offline claim, passphrase second factor, expiry race  
- Swap ADR (only when LN enabled)  
- Appendix A: NUMS hex golden vector  

---

## 18. Open implementation details (not product forks)

These may be fixed in ADRs **without** changing product intent, but **must not** change address identity for package `v: 1` once mainnet/testnet4 vectors ship:

1. Exact Esplora base URLs in deploy config  
2. Compact binary encoding for share_card QR (optional; JSON is normative fallback)  
3. Whether offline HTML is generated per-gift or is a generic app that imports JSON  
4. Concrete swap provider (requires §9 ADR)  
5. Optional per-gift donate key derivation (privacy upgrade; new policy version if it changes `R` rules)

**Frozen for v1 (not open):** NUMS construction (§4.4), leaf order (§4.1), KDF transcripts (§4.2), package variant fields (§5.3), network `testnet4` (§14.0).

---

## 19. Glossary

| Term | Meaning |
|------|---------|
| Claim secret | 32-byte root in share package / URL fragment |
| Claim key `C` | X-only pubkey for claim leaf |
| Expiry key `R` | X-only pubkey for expiry leaf |
| Refund secret | 32-byte root for `refund_self` (full backup only) |
| Gift package | Versioned JSON artifact(s) |
| Vault UTXO | On-chain Taproot output holding gift value |
| Bearer instrument | Possession of claim capability ≈ ability to spend until spent |
| Website process | Hot web infrastructure — must be keyless |
| Project cold key | Offline donate expiry authority |

---

## 20. Decision log (locked)

| Decision | Choice |
|----------|--------|
| Architecture | Taproot claim `pk(C)` OR `older(T) ∧ pk(R)` |
| Website custody | Never holds spend keys |
| Project donate | Cold key may spend expiry for `donate_project` after CSV |
| Link model | Bearer + optional passphrase (KDF second factor) |
| Unclaimed | Sender chooses: refund self / donate project / custom **key** |
| Expiry destination | Chosen at spend time by `R` holder (no covenant) |
| Fees | Claimant pays network fees; no protocol fee in script |
| Project tip | Default **3%** of gift at create, **fully editable** (including 0); separate from vault |
| Confirmations | ≥1 conf to share/claim; no 0-conf product |
| Post-`T` | Race; first confirmed spend wins |
| UX | Non-technical primary path; claim supports custodial exchanges + any address |
| Site | Convenience only; offline package + HTML required |
| LN | Optional; ADR-gated; not v1 success bar |
| v1 network | **testnet4** |
| Claim wallets (2026) | Phoenix / Muun / BlueWallet mobile; Sparrow desktop; exchanges optional |
| Buy BTC to fund | Third-party on-ramp to gift address; Strike/Kraken/Gemini guided |

---

## 21. Product disclaimer (required in UI footer)

> Gift Bitcoin (giftbitcoin.app, Bitcoin testnet4) is non-custodial software. Share packages and claim links are bearer instruments: anyone who has them (and the passphrase, if set) can take the funds until they are spent — including after the refund timer. After the timer, refund/donate and claim race; first confirmed spend wins. The website operators cannot reverse transactions, restore lost links, or move your coins. If you chose donate-to-project, the project’s cold key may recover unclaimed gifts after the timer. Bitcoin transactions are public. This deployment is for **testnet4** only and has no real monetary value.

---

## 22. Suggested improvements (backlog — not blocking v1)

Prioritized follow-ups beyond v0.2 correctness. Implement only when needed; each should get a short ADR if it changes packages or scripts.

| ID | Improvement | Why | Effort |
|----|-------------|-----|--------|
| I1 | **Per-gift donate `R`** from project xpub (`…/0/i`) | Reduces on-chain clustering of donate gifts | Low |
| I2 | **MuSig/multisig project cold key** | Reduces single-key donate compromise | Med |
| I3 | **2-of-2 claim path optional** (recipient pre-registers) | Rare; breaks “unknown recipient” default | High |
| I4 | **CTV/covenant expiry pay-to-fixed-address** | True “must go to address X” custom policy | High + softfork dependent |
| I5 | **HWI / hardware signing for refund** | Safer large-value sender recovery | Med |
| I6 | **PayJoin or equal-output claim** | Mild privacy for claim tx shape | Med |
| I7 | **Tor-only indexer preset** | One-click privacy for chain queries | Low |
| I8 | **Compact binary share QR** (CBOR/protobuf) | Easier print/scan than fat JSON | Low |
| I9 | **Watchtower-style sender notify** (optional, privacy-preserving) | Email “your gift was claimed” without custody — hard without leaky design | High |
| I10 | **Mainnet release checklist** | Legal review still “by design”; ops, donate multisig, feerate floors | Med |
| I11 | **Deterministic test vectors file** (`vectors/v1.json`) | Cross-impl compatibility | Low |
| I12 | **Claim decoy / steganographic share** | Optional; reduce shoulder-surf of QR “cash” | Low |
| I13 | **Fee sponsorship via separate input** | Sender prepays claim fee output — complex, easy to get wrong | High |
| I14 | **Signet profile** | Public demo without testnet4 faucet pain | Low |
| I15 | **Locale / i18n** | Normie UX at scale | Med |

---

## Appendix A — NUMS golden vector

Frozen for package `v: 1` (see also `vectors/v1.json`):

```text
NUMS_XONLY = 92ad1b6550ec770c856c0d2d73c770cd1d3ae50262d3fd0df7d85511f9064ef9
iteration  = 0
construction = SHA256(UTF-8("BTCGiftcard/v1/NUMS")); rehash until BIP340 lift_x succeeds
```

---

## Appendix B — v0.1 → v0.2 mapping (CA fixes)

| CA item | Resolution |
|---------|------------|
| Claim “before T” | §3.1 until spent; post-`T` race normative |
| Operator never vs donate | Website process vs project cold key split |
| Package refund fields | §5.3 `refund.secret_b64url` |
| KDF order / forks | §4.2 single HKDF / Argon2 transcripts |
| X-only keys | §4.1 / §5.2 |
| NUMS + leaf order | §4.1 / §4.4 frozen |
| Multi-UTXO / CSV | §6.1 per-UTXO predicates |
| State machine | §6.2 aggregate labels |
| LN underspec | §9 ADR gate; out of success bar |
| Offline bar | §5.5 + §14.1 HTML required |
| custom/donate R | Pubkey/xpub+path only; no address-as-R |
| Under/over fund | §8.1 |
| testnet pin + scalarize | §14.0 / §4.2.2 |
| “Passphrase-wrapped” | “Passphrase required” |
| Wrong §5 xref | §4.2.6 → §4.3 |
| Residual risks | §11.3 expanded |

---

*End of specification v0.2*
