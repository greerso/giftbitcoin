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

export function parseShareCardFragment(fragment: string): Record<string, unknown> {
	const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	if (!frag.startsWith('g1.')) throw new Error('not a full gift link');
	const bytes = b64urlToBytes(frag.slice('g1.'.length));
	return JSON.parse(new TextDecoder().decode(bytes));
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
