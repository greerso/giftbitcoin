# Deploy — giftbitcoin.app on Coolify + Cloudflare Tunnel

## Status (2026-07-12 — giftbitcoin.app is LIVE)

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
| `giftbitcoin.app` | `https://localhost:443` + `originServerName: giftbitcoin.app` |
| `www.giftbitcoin.app` | `https://localhost:443` + `originServerName: www.giftbitcoin.app` |

Same pattern as every working `*.magnolia.photos` hostname: the tunnel speaks **HTTPS** to Traefik so it terminates TLS and serves the app directly. ⚠️ Do **not** use `http://localhost:80` — Traefik's `redirect-to-https` middleware then 302-loops every request through Cloudflare (this was the original bug; fixed 2026-07-12).

### Live URLs

| URL | Notes |
|-----|--------|
| https://giftbitcoin.greerso.com | Works (direct / LE on greerso DNS) |
| https://giftbitcoin.app | **Live** ✅ (proxied CNAME → tunnel, strict-TLS ingress) |
| https://www.giftbitcoin.app | **Live** ✅ |

---

## DNS (Cloudflare) — done ✅

Both records exist as **proxied CNAMEs** → the tunnel (`@` and `www` → `45ab2a45-9512-46f8-bae4-0c882e02df73.cfargotunnel.com`). A public A record to the home IP is **not** used — traffic goes through the Coolify Cloudflare Tunnel.

Note on credentials: the DNS-API token cannot write the `giftbitcoin.app` zone (dashboard only for DNS records), but the token at `~/.cloudflare/token` **can** read+write the tunnel *configuration* (used for the ingress fix below). Zone SSL/TLS mode settings are not readable with it.

## The redirect-loop fix (2026-07-12)

`giftbitcoin.app` initially 302-looped to itself because the tunnel ingress routed to `http://localhost:80` and Traefik's `redirect-to-https` bounced every request through Cloudflare. Fixed by changing the two ingress rules to `https://localhost:443` + `originServerName` (see the ingress table above), mirroring the working `*.magnolia.photos` hostnames. Applied via:

```bash
# GET current, edit only the two giftbitcoin rules, PUT the WHOLE config back
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/be2bd16875fa34522156e6ac19582579/cfd_tunnel/45ab2a45-9512-46f8-bae4-0c882e02df73/configurations" \
  -H "Authorization: Bearer $(cat ~/.cloudflare/token)" -H "Content-Type: application/json" --data @<config.json>
```

⚠️ A PUT **replaces the entire tunnel config** — always preserve every other ingress rule + the `http_status:404` catch-all.

Verify:

```bash
curl -sI https://giftbitcoin.app          # HTTP/2 200, no redirect loop
curl -sI https://www.giftbitcoin.app      # 200
```

SSL: Cloudflare edge terminates HTTPS to the client; the tunnel then speaks HTTPS to Traefik (strict verify — Traefik's LE cert for `giftbitcoin.app` issued once the domain reached it). Host-based routing throughout.

---

## Send relay Worker (/api/send)

The email relay is a Cloudflare Worker (`worker/`) on the giftbitcoin.app zone — the static
origin is untouched. One-time setup, in order:

1. **Email Sending onboarding:** `npx wrangler email sending enable giftbitcoin.app`
   (adds DKIM/SPF records; the Worker sends from `gifts@giftbitcoin.app`).
2. **Turnstile widget:** create in the CF dashboard (Turnstile → Add widget, mode: managed,
   domain `giftbitcoin.app`). Put the **site key** in `src/config/send.ts`
   (`TURNSTILE_SITE_KEY` — currently the dummy always-pass key) and rebuild/redeploy the
   static app. Store the **secret**: `npx wrangler secret put TURNSTILE_SECRET -c worker/wrangler.jsonc`.
3. **Deploy:** `npx wrangler deploy -c worker/wrangler.jsonc` — the route
   `giftbitcoin.app/api/send` is in the config. Rate limits + esplora base are vars there.
4. **Smoke test:** create a passphrase (email-delivery) gift on the live site, fund it,
   and send to an external email address you control but that has **not** been pre-verified
   or added to the Cloudflare account in any way (not a destination address, not an account
   login) — this confirms the Worker can deliver to arbitrary recipients, not just addresses
   Cloudflare already trusts. Check the mail arrives and `POST /api/send` with a
   three-segment link returns 400. If delivery fails with an "allowed list" or
   recipient-restriction-shaped error, the `send_email` binding config needs review before
   this feature can be trusted with real (non-account-holder) recipients.

**Note:** Everything in Tasks 8–10 (Turnstile verify, esplora funding check with Cache API, `unsafe`
ratelimit bindings, `env.EMAIL.send()`) was tested against Node-stubbed fetch/mocks in vitest, NOT the real
Cloudflare Workers runtime. Binding shapes, `caches.default` behavior, and the ratelimit binding only
execute for real at deploy — treat the first live deployment as the actual first verification of these
runtime behaviors.

The Worker stores nothing persistent (rate-limit counters + a 60 s funding-check cache).
Interim domains (giftbitcoin.greerso.com) are rejected by `ALLOWED_ORIGIN` by design.

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
