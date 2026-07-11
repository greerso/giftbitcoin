# Deploy — giftbitcoin.app on Coolify (Thinkstation)

## Status (2026-07-11)

| Item | Value |
|------|--------|
| Coolify context | **Thinkstation** (`http://10.0.0.66:8000`) |
| Server | Thinkstation `wgc8cg4w08kks4s8o8scscso` |
| Project | Personal `bks8cwwc4ggk440kkgkco8ko` |
| Destination | `lgc4ko88o80wsogcc8kkkow8` (coolify network) |
| App UUID | `jdhe9b54fe70iddhxr351sml` |
| App name | Gift Bitcoin |
| Git | https://github.com/greerso/giftbitcoin (`main`) |
| Build | Dockerfile → nginx:alpine serves `/build` on port **80** |
| Status | **running:healthy** |

### Live URLs

| URL | Notes |
|-----|--------|
| https://giftbitcoin.greerso.com | **Works now** (Let’s Encrypt via greerso DNS) |
| https://giftbitcoin.app | Needs DNS A/CNAME (see below) |
| https://www.giftbitcoin.app | Same |

## DNS for giftbitcoin.app (Cloudflare)

Zone is on Cloudflare (`dba6efb7533a41932c75f62ce37e4391`).  
Local API token can **list the zone** but **cannot create DNS records** (auth error on `/dns_records`). Add in the dashboard:

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **giftbitcoin.app** → **DNS** → **Records**
2. **A** `@` → `97.81.152.131` (Thinkstation public / greerso.ddns.net)  
   - Start **DNS only** (grey cloud) so Coolify Let’s Encrypt HTTP-01 can complete  
   - After cert is healthy, optional: enable **Proxied** (orange) + SSL mode **Full (strict)**
3. **CNAME** `www` → `giftbitcoin.app` (same proxy setting as apex)

Alternative (tunnel-style, like magnolia.photos): CNAME apex to  
`45ab2a45-9512-46f8-bae4-0c882e02df73.cfargotunnel.com`  
and add a public hostname on the **magnolia-thinkstation** tunnel → `http://localhost:80` (Traefik) with Host `giftbitcoin.app`. Requires Zero Trust / tunnel config edit.

### After DNS propagates

```bash
coolify deploy uuid jdhe9b54fe70iddhxr351sml   # refresh certs if needed
curl -sI https://giftbitcoin.app
```

## Redeploy

```bash
coolify --context Thinkstation deploy uuid jdhe9b54fe70iddhxr351sml
# or after git push to main:
git push origin main
coolify deploy uuid jdhe9b54fe70iddhxr351sml
```

## Local / repo

```bash
cd ~/dev/BTCGiftcard   # same as giftbitcoin git remote
npm run dev
npm test
npm run build
```

## Security notes

- Static site only; no gift private keys on server  
- Claim secrets stay in browser URL fragments / packages  
- Healthcheck: `GET /` → 200  
