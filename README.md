# Gift Bitcoin (`giftbitcoin.app`)

Non-custodial Bitcoin e-giftcards: fund a Taproot output, share a claim package/link, recipient redeems to their address. The **website process** never holds spend keys.

**Brand / domain:** [giftbitcoin.app](https://giftbitcoin.app) — see [docs/BRAND.md](./docs/BRAND.md)  
**v1 network:** Bitcoin **testnet4** only.

## Docs

| Doc | Purpose |
|-----|---------|
| [SPEC.md](./SPEC.md) | Protocol & product source of truth |
| [docs/BRAND.md](./docs/BRAND.md) | Name, domain, voice |
| [docs/CLAIM-UX.md](./docs/CLAIM-UX.md) | Claim UX for newbs + exchanges |
| [docs/WALLETS-AND-ONRAMP-2026.md](./docs/WALLETS-AND-ONRAMP-2026.md) | 2026 wallets + buy-BTC on-ramp |
| [docs/MONETIZATION.md](./docs/MONETIZATION.md) | Tips / income without custody |
| [TODO.md](./TODO.md) | Backlog |
| [vectors/v1.json](./vectors/v1.json) | Frozen crypto golden vectors |

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build   # static site → build/
```

## Status

- **Done:** crypto core, golden vectors, full create/claim/recover UI, Esplora fund-watch + claim broadcast (unit-tested), send mechanism (PR #14): generated passphrases, share tier, QR, Worker `/api/send`.
- **Live:** https://giftbitcoin.app (+ www, + giftbitcoin.greerso.com). Coolify + CF tunnel.
- **Next:** CF Email Sending domain onboard (dashboard — see [docs/DEPLOY.md](./docs/DEPLOY.md)), funded email smoke, claim destination chooser (C1–C9), tip address. Refund/offline claim = **v1.1**.

## Disclaimer

Share packages and claim links are bearer instruments. After the refund timer, claim and refund **race**. Lost links cannot be restored by the website. Testnet coins have no real value.
