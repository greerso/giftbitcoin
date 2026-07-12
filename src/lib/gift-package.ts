/**
 * SPEC §5.2/§5.3 gift packages + claim link. Builds the three normative export
 * variants (share_card / sender_full_backup / sender_watch_only) and the g1.
 * claim link from a CreatedGift.
 */
import {
	verifyGiftPackage,
	type CreatedGift,
	type GiftScriptFields,
	type VerifyResult
} from '$lib/crypto/create-gift';
import { bytesToB64url, b64urlToBytes } from '$lib/crypto/keys';
import { normalizePassphraseInput } from '$lib/crypto/passphrase';
import { ACTIVE_NETWORK } from '$config/network';

export interface GiftMeta {
	amountExpectedSats: number;
	/** records only — never required to claim; SPEC §8.1 keeps it out of share_card */
	tipSatsSuggested?: number;
	memo?: string;
	fromName?: string;
	toName?: string;
	cardDesign?: string;
	expiryDays?: number;
	origin?: string;
	createdAt?: string;
}

function common(gift: CreatedGift, meta: GiftMeta) {
	const days = meta.expiryDays ?? Math.round(gift.T / 144);
	const o: Record<string, unknown> = {
		v: 1,
		network: ACTIVE_NETWORK.packageNetwork,
		created_at: meta.createdAt ?? new Date().toISOString(),
		script: {
			descriptor: gift.descriptor,
			nums_xonly: gift.payment.nums_xonly,
			T: gift.T,
			C_xonly: gift.payment.C_xonly,
			R_xonly: gift.payment.R_xonly,
			address: gift.payment.address,
			script_pub_key: gift.payment.scriptPubKeyHex
		},
		expiry_policy: {
			type: gift.policy,
			T_blocks: gift.T,
			human: `~${days} days after each UTXO confirms (per-input CSV)`
		},
		amount_expected_sats: meta.amountExpectedSats,
		recovery: {
			claim_url_template: `${meta.origin ?? ''}/c#<PAYLOAD>`,
			offline_checklist: 'SPEC §5.5'
		}
	};
	if (meta.memo) o.memo = meta.memo;
	if (meta.toName) o.to_name = meta.toName;
	if (meta.fromName) o.from_name = meta.fromName;
	if (meta.cardDesign) o.card_design = meta.cardDesign;
	return o;
}

export interface GiftPackages {
	share_card: Record<string, unknown>;
	sender_full_backup: Record<string, unknown>;
	sender_watch_only: Record<string, unknown>;
}

export function buildPackages(gift: CreatedGift, meta: GiftMeta): GiftPackages {
	const base = common(gift, meta);
	const claimMeta = { passphrase_required: gift.passphraseRequired, kdf: gift.kdf };

	const share_card = { ...base, claim: { secret_b64url: gift.claimSecretB64url, ...claimMeta } };

	const sender_full_backup: Record<string, unknown> = {
		...base,
		claim: { secret_b64url: gift.claimSecretB64url, ...claimMeta }
	};
	if (gift.refundSecretB64url) {
		sender_full_backup.refund = {
			secret_b64url: gift.refundSecretB64url,
			kdf: { name: 'hkdf-sha256', info: 'btcgiftcard/v1/refund' },
			R_xonly: gift.payment.R_xonly
		};
	}
	if (meta.tipSatsSuggested !== undefined) {
		sender_full_backup.tip_sats_suggested = meta.tipSatsSuggested;
	}

	// watch-only: no secret material, safe to sync/store in the cloud.
	const sender_watch_only = { ...base, claim: claimMeta };

	return { share_card, sender_full_backup, sender_watch_only };
}

/**
 * Self-sufficient claim link: the whole share_card, so the recipient's page can
 * show the card and locate the funds from the link alone (the SPEC §5.4 g1.
 * payload). Fragment-only — never sent to a server.
 */
export function fullClaimLink(shareCard: Record<string, unknown>, origin: string): string {
	const json = JSON.stringify(shareCard);
	return `${origin}/c#g1.${bytesToB64url(new TextEncoder().encode(json))}`;
}

/**
 * SPEC §5.4 fragment grammar: g1.<share_card_b64url> with an optional third
 * segment g1.<card>.<passphrase_b64url> (QR-only, self-sent opt-in gifts).
 * Dots don't occur in base64url, so splitting is unambiguous.
 */
function splitGiftFragment(fragment: string): { card: string; pass?: string } {
	const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	if (!frag.startsWith('g1.')) throw new Error('not a full gift link');
	const segs = frag.slice('g1.'.length).split('.');
	if (segs.length > 2 || segs.some((s) => s.length === 0)) {
		throw new Error('malformed gift fragment');
	}
	return { card: segs[0], pass: segs[1] };
}

export function parseShareCardFragment(fragment: string): Record<string, unknown> {
	const bytes = b64urlToBytes(splitGiftFragment(fragment).card);
	return JSON.parse(new TextDecoder().decode(bytes));
}

/** Decoded passphrase from a three-segment fragment; undefined on two-segment links. */
export function fragmentPassphrase(fragment: string): string | undefined {
	const { pass } = splitGiftFragment(fragment);
	if (pass === undefined) return undefined;
	return new TextDecoder().decode(b64urlToBytes(pass)).normalize('NFC');
}

/**
 * Three-segment claim link — QR rendering for self-sent opt-in gifts ONLY.
 * Copy-link/share/email paths must keep using fullClaimLink (two-segment).
 */
export function claimLinkWithPassphrase(
	shareCard: Record<string, unknown>,
	origin: string,
	passphrase: string
): string {
	const norm = passphrase.normalize('NFC');
	if (norm.length === 0) throw new Error('passphrase must not be empty');
	const pass = bytesToB64url(new TextEncoder().encode(norm));
	return `${fullClaimLink(shareCard, origin)}.${pass}`;
}

/** True if the fragment (with or without a leading '#') claims to be a g1. payload. */
export function isGiftFragment(fragment: string): boolean {
	const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	return frag.startsWith('g1.');
}

/** Shared copy for a recognized-but-unparsable g1. fragment (claim + recover pages). */
export const CORRUPT_LINK_MSG =
	'That looks like a gift link, but it’s damaged or incomplete — make sure the whole link was copied (everything after the #), then try again.';

/**
 * SPEC §5.3 integrity check on the WIRE form — the parsed share_card a
 * recipient's page works from. The create flow runs it on the freshly built
 * package (round-tripped through the claim link) so a serialization regression
 * is caught before the address can be funded, not by the recipient.
 */
export async function verifyShareCard(
	sc: Record<string, unknown>,
	passphrase?: string
): Promise<VerifyResult> {
	try {
		const claim = (sc.claim ?? {}) as { secret_b64url?: string; passphrase_required?: boolean };
		if (!claim.secret_b64url) return { ok: false, errors: ['missing claim secret'] };
		return await verifyGiftPackage({
			secret: b64urlToBytes(claim.secret_b64url, 32),
			passphrase,
			passphraseRequired: Boolean(claim.passphrase_required),
			script: (sc.script ?? {}) as GiftScriptFields
		});
	} catch (e) {
		return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
	}
}

/**
 * Claim-side passphrase check: normalized input first (case/whitespace/NFC),
 * then one retry with the raw NFC-only input — pre-2026-07-12 gifts carry
 * human-chosen passphrases derived NFC-only, and must stay claimable without
 * a version marker. Each attempt is a full Argon2id run by design.
 */
export async function verifyShareCardPassphrase(
	sc: Record<string, unknown>,
	rawInput: string
): Promise<{ ok: boolean; passphrase: string; errors: string[] }> {
	const normalized = normalizePassphraseInput(rawInput);
	const first = await verifyShareCard(sc, normalized);
	if (first.ok) return { ok: true, passphrase: normalized, errors: [] };
	const raw = rawInput.normalize('NFC');
	if (raw !== normalized) {
		const second = await verifyShareCard(sc, raw);
		if (second.ok) return { ok: true, passphrase: raw, errors: [] };
	}
	return { ok: false, passphrase: normalized, errors: first.errors };
}
