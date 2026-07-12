/**
 * SPEC §5.2/§5.3 gift packages + claim link. Builds the three normative export
 * variants (share_card / sender_full_backup / sender_watch_only) and both claim
 * link forms from a CreatedGift.
 */
import type { CreatedGift } from '$lib/crypto/create-gift';
import { encodeSecretPayload } from '$lib/crypto/payload';
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

/** Normative short claim payload (SPEC §5.4): `v1.`/`v1.p.` + secret_b64url. */
export function claimUrl(gift: CreatedGift, origin: string): string {
	return `${origin}/c#${encodeSecretPayload(gift.claimSecret, gift.passphraseRequired)}`;
}

/**
 * Self-sufficient claim link: the whole share_card, so the recipient's page can
 * show the card and locate the funds from the link alone (the SPEC §5.4 "compact
 * payload extension"). Fragment-only — never sent to a server.
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
