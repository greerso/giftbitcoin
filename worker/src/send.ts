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
	if (typeof b.turnstile_token !== 'string' || !b.turnstile_token) return bad('turnstile_required');
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
		return { to, link, fromName, message, address: payment.address };
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
