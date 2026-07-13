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
origin is untouched. **Outbound mail uses AWS SES** (not Cloudflare Email Sending).

### Status

| Step | Status |
|------|--------|
| Worker deploy `giftbitcoin-send` | Live on `giftbitcoin.app/api/send` |
| Turnstile managed widget | Done — secret via wrangler |
| Mail transport | **AWS SES** (`us-east-1`), from `gifts@greerso.com` (SES-verified domain greerso.com) |
| IAM for Worker | **`giftbitcoin-send-ses`** — SES send only on greerso.com identities |
| Cloudflare Email Sending | **Not used** (paid product skipped) |
| Coolify static app | Live on main |

### Secrets (Worker)

```bash
npx wrangler secret put TURNSTILE_SECRET -c worker/wrangler.jsonc
npx wrangler secret put AWS_ACCESS_KEY_ID -c worker/wrangler.jsonc
npx wrangler secret put AWS_SECRET_ACCESS_KEY -c worker/wrangler.jsonc
```

`AWS_REGION`, `FROM_EMAIL`, `ALLOWED_ORIGIN`, `ESPLORA_BASE` are non-secret vars in
`worker/wrangler.jsonc`. Production keys come from IAM user **`giftbitcoin-send-ses`**
(inline policy `GiftBitcoinSendSesOnly`: `ses:SendEmail` / `ses:SendRawEmail` on
`identity/greerso.com` + `identity/gifts@greerso.com` only — not the broad `awscli` user).

### Optional: send from @giftbitcoin.app

Verify the domain in SES (DKIM CNAMEs in the giftbitcoin.app zone), then set
`FROM_EMAIL` to `gifts@giftbitcoin.app` and redeploy. Until then branding uses
display name **GiftBitcoin** with envelope from greerso.com.

### Smoke test

**Gates (live):** GET → 405; three-segment link POST → 400 `bad_link`; missing Turnstile → 400.

**Full path:** create a passphrase (email-delivery) gift on the live site, fund it on
testnet4, send to an external inbox. Confirm mail arrives from `gifts@greerso.com`.

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
