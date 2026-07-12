/**
 * POST /api/send — send-and-forget email relay for passphrase-committed gifts.
 * Design: docs/superpowers/specs/2026-07-12-send-mechanism-design.md.
 * SPEC §5.1 carve-out: the share_card transits, is never persisted, never logged.
 */
import * as btc from '@scure/btc-signer';
import { buildGiftPayment } from '../../src/lib/crypto/gift-script';
import { hexToBytesStrict, b64urlToBytes } from '../../src/lib/crypto/keys';
import type { SendEnv } from './types';

const B64URL = /^[A-Za-z0-9_-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidSend {
	to: string;
	link: string;
	fromName: string;
	message: string;
	address: string;
	turnstileToken: string;
}
export type SendError = { error: string; status: number };

const bad = (error: string): SendError => ({ error, status: 400 });

export function validateSend(body: unknown, env: SendEnv): ValidSend | SendError {
	if (typeof body !== 'object' || body === null) return bad('bad_request');
	const b = body as Record<string, unknown>;
	const to = typeof b.to === 'string' ? b.to.trim() : '';
	const link = typeof b.link === 'string' ? b.link : '';
	const fromName = typeof b.from_name === 'string' ? b.from_name.trim() : '';
	const message = typeof b.message === 'string' ? b.message.trim() : '';
	const turnstileToken = typeof b.turnstile_token === 'string' ? b.turnstile_token : '';
	if (!turnstileToken) return bad('turnstile_required');
	if (!EMAIL_RE.test(to) || to.length > 254) return bad('bad_email');
	if (fromName.length > 64 || /[\r\n]/.test(fromName)) return bad('bad_from_name');
	if (message.length > 280) return bad('bad_message');

	// Link: our origin, g1. grammar, exactly two segments (passphrase segment rejected).
	const prefix = `${env.ALLOWED_ORIGIN}/c#g1.`;
	if (!link.startsWith(prefix) || link.length > 8192) return bad('bad_link');
	const payload = link.slice(prefix.length);
	if (!B64URL.test(payload)) return bad('bad_link'); // a '.' (3-segment) fails this too

	let card: Record<string, unknown>;
	try {
		card = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
	} catch {
		return bad('bad_link');
	}
	// JSON.parse('null')/('42')/('"x"') all succeed without throwing — a bare
	// object-shape check is required before any property is dereferenced.
	if (typeof card !== 'object' || card === null) return bad('bad_link');
	if (card.network !== 'testnet4') return bad('bad_network');
	const claim = (card.claim ?? {}) as Record<string, unknown>;
	// UX guard on the honest path, not an abuse control — a forged card can set it.
	if (claim.passphrase_required !== true) return bad('passphrase_required');

	// Recompute the taproot address from the card's script fields — without this,
	// any funded address copied off a block explorer would pass the funding check.
	const script = (card.script ?? {}) as Record<string, unknown>;
	try {
		const payment = buildGiftPayment({
			C: hexToBytesStrict(String(script.C_xonly), 32),
			R: hexToBytesStrict(String(script.R_xonly), 32),
			T: Number(script.T),
			network: btc.TEST_NETWORK
		});
		if (payment.address !== script.address) return bad('address_mismatch');
		if (payment.nums_xonly !== script.nums_xonly) return bad('address_mismatch');
		return { to, link, fromName, message, address: payment.address, turnstileToken };
	} catch {
		return bad('bad_card');
	}
}

/** Turnstile siteverify — required gate; any error counts as failure. */
export async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
	try {
		const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ secret, response: token, remoteip: ip })
		});
		if (!r.ok) return false;
		const outcome = (await r.json()) as { success?: boolean };
		return outcome.success === true;
	} catch {
		return false;
	}
}

/**
 * Server-side funding check: ≥1 confirmed UTXO. Hard 5 s timeout; THROWS on any
 * esplora failure so the caller fails closed (no email). 60 s Cache API layer
 * (public chain data keyed on the esplora URL — no link material) absorbs
 * duplicate taps; absent outside Workers (node tests) → plain fetch.
 */
export async function checkFunded(address: string, env: SendEnv): Promise<boolean> {
	const url = `${env.ESPLORA_BASE}/address/${encodeURIComponent(address)}/utxo`;
	const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
	let res = await cache?.match(url);
	if (!res) {
		res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) throw new Error(`esplora ${res.status}`);
		if (cache) {
			const copy = new Response(res.clone().body, res);
			copy.headers.set('Cache-Control', 'max-age=60');
			await cache.put(url, copy);
		}
	}
	const utxos = (await res.json()) as Array<{ status?: { confirmed?: boolean } }>;
	return utxos.some((u) => u.status?.confirmed === true);
}

/** Rate-limit key for the gift address — the counter never sees the link. */
export async function sha256Hex(s: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fixed branded template. The claim link is the only link; never a passphrase. */
export function renderEmail(link: string, fromName: string, message: string) {
	const who = fromName ? `${esc(fromName)} sent` : 'Someone sent';
	const note = message
		? `<p style="margin:16px 0;padding:12px 16px;background:#f7f2e7;border-radius:10px;color:#4a4436;">${esc(message).replace(/\n/g, '<br>')}</p>`
		: '';
	const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2b2620;">
<h1 style="font-size:22px;">${who} you a Bitcoin gift 🎁</h1>
${note}
<p><a href="${link}" style="display:inline-block;background:#c97210;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">Open your gift</a></p>
<p style="font-size:14px;color:#6b6355;">The sender will give you <strong>4 secret words</strong> to open it — this email alone can't claim the gift.</p>
<p style="font-size:12px;color:#9a8e71;">Bitcoin testnet4 — no real value. If the button doesn't work, copy this link:<br>${link}</p>
</div>`;
	const text = `${who} you a Bitcoin gift.
${message ? '\n"' + message + '"\n' : ''}
Open it: ${link}

The sender will give you 4 secret words to open it — this email alone can't claim the gift.
(Bitcoin testnet4 — no real value.)`;
	// Subject is a header value, not HTML — use the raw (CRLF-validated by validateSend) name, not esc().
	return { subject: `${fromName ? fromName + ' sent' : 'Someone sent'} you a Bitcoin gift`, html, text };
}

const json = (status: number, body: Record<string, unknown>) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, error: string) => json(status, { ok: false, error });

/** The full pipeline. Send-and-forget: nothing persistent, no logging of the body. */
export async function handleSend(request: Request, env: SendEnv): Promise<Response> {
	if (request.method !== 'POST') return fail(405, 'method');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return fail(400, 'bad_json');
	}
	// Cheap gate first: per-IP counter (CF-Connecting-IP is set by Cloudflare itself).
	const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
	if (!(await env.IP_LIMIT.limit({ key: ip })).success) return fail(429, 'rate_limited');

	const v = validateSend(body, env);
	if ('error' in v) return fail(v.status, v.error);

	if (!(await env.ADDR_LIMIT.limit({ key: await sha256Hex(v.address) })).success) {
		return fail(429, 'rate_limited');
	}
	if (!(await verifyTurnstile(v.turnstileToken, ip, env.TURNSTILE_SECRET))) {
		return fail(403, 'turnstile_failed');
	}
	// Funding check LAST among gates: fails closed on esplora trouble.
	let funded: boolean;
	try {
		funded = await checkFunded(v.address, env);
	} catch {
		return fail(502, 'chain_unavailable');
	}
	if (!funded) return fail(400, 'not_funded');

	const { subject, html, text } = renderEmail(v.link, v.fromName, v.message);
	try {
		await env.EMAIL.send({
			to: v.to,
			from: { email: env.FROM_EMAIL, name: 'GiftBitcoin' },
			subject,
			html,
			text
		});
	} catch {
		return fail(502, 'send_failed');
	}
	return json(200, { ok: true });
}
