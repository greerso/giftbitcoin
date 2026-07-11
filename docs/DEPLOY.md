# Deploy — giftbitcoin.app on Coolify + Cloudflare Tunnel

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
| Build | Dockerfile → nginx on port **80** |
| App status | **running:healthy** |
| **CF Tunnel** | **magnolia-thinkstation** `45ab2a45-9512-46f8-bae4-0c882e02df73` |
| Tunnel service | Coolify service `ipnqsixmv1abryxvyhkl2fky` (cloudflared) |

### Tunnel ingress (done)

Public hostnames on the Coolify tunnel → Traefik on the host:

| Hostname | Origin |
|----------|--------|
| `giftbitcoin.app` | `http://localhost:80` |
| `www.giftbitcoin.app` | `http://localhost:80` |

Same pattern as other Coolify apps (Host header → Traefik → container).

### Live URLs

| URL | Notes |
|-----|--------|
| https://giftbitcoin.greerso.com | Works (direct / LE on greerso DNS) |
| https://giftbitcoin.app | **Needs DNS CNAME → tunnel** (see below) |
| https://www.giftbitcoin.app | Same |

---

## DNS (Cloudflare) — required for giftbitcoin.app

API token used here **cannot write DNS** on the `giftbitcoin.app` zone (auth error), even though tunnel config API works. Add records in the [Cloudflare Dashboard](https://dash.cloudflare.com) → **giftbitcoin.app** → **DNS**:

| Type | Name | Content | Proxy |
|------|------|---------|--------|
| **CNAME** | `@` | `45ab2a45-9512-46f8-bae4-0c882e02df73.cfargotunnel.com` | **Proxied** (orange) |
| **CNAME** | `www` | `45ab2a45-9512-46f8-bae4-0c882e02df73.cfargotunnel.com` | **Proxied** (orange) |

Do **not** use a public A record to the home IP for this setup — traffic should go through the Coolify **Cloudflare Tunnel** service.

After DNS propagates:

```bash
dig +short giftbitcoin.app CNAME   # expect …cfargotunnel.com or CF flats
curl -sI https://giftbitcoin.app
coolify deploy uuid jdhe9b54fe70iddhxr351sml   # if cert/router needs refresh
```

SSL: Cloudflare edge terminates HTTPS; origin is HTTP to Traefik on the tunnel host. Coolify may still issue a LE cert for Traefik; tunnel uses Host-based routing either way.

---

## Architecture

```text
Browser → Cloudflare (HTTPS, orange cloud)
       → Tunnel magnolia-thinkstation
       → http://localhost:80 (Traefik on Thinkstation)
       → Gift Bitcoin container :80 (nginx static)
```

---

## Redeploy

```bash
git push origin main
coolify --context Thinkstation deploy uuid jdhe9b54fe70iddhxr351sml
```

## Local

```bash
cd ~/dev/BTCGiftcard
npm run dev
npm test
npm run build
```

## Security notes

- Static site only; no gift private keys on server  
- Claim secrets stay in browser URL fragments / packages  
- Healthcheck: `GET /` → 200  
