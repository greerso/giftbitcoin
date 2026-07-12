/**
 * High-level gift creation — client-side only
 */
import {
	randomSecret,
	claimPrivFromSecret,
	claimPrivFromPassphrase,
	refundPrivFromSecret,
	xOnlyFromPriv,
	claimKdfNoPass,
	claimKdfPassphrase,
	bytesToHex,
	bytesToB64url,
	hexToBytesStrict,
	type ClaimKdf
} from './keys';
import { buildGiftPayment, descriptorString, type GiftPayment } from './gift-script';
import { DEFAULT_T_BLOCKS } from '../../config/network';
import * as btc from '@scure/btc-signer';

export type ExpiryPolicy = 'refund_self' | 'donate_project' | 'custom';

export interface CreateGiftInput {
	T?: number;
	policy: ExpiryPolicy;
	/** Required for custom: 32-byte x-only R */
	customR?: Uint8Array;
	/** Required for donate_project if not using empty config */
	donateR?: Uint8Array;
	passphrase?: string;
	network?: typeof btc.TEST_NETWORK | typeof btc.NETWORK;
}

export interface CreatedGift {
	claimSecret: Uint8Array;
	/** base64url (unpadded) — the SPEC §5.3/§5.4 on-wire form for packages/links */
	claimSecretB64url: string;
	refundSecret?: Uint8Array;
	refundSecretB64url?: string;
	passphraseRequired: boolean;
	kdf: ClaimKdf;
	claimPriv: Uint8Array;
	C: Uint8Array;
	R: Uint8Array;
	T: number;
	policy: ExpiryPolicy;
	payment: GiftPayment;
	descriptor: string;
}

export async function createGift(input: CreateGiftInput): Promise<CreatedGift> {
	const T = input.T ?? DEFAULT_T_BLOCKS;
	const claimSecret = randomSecret(32);
	const passphraseRequired = Boolean(input.passphrase && input.passphrase.length > 0);

	let claimPriv: Uint8Array;
	let kdf: ClaimKdf;
	if (passphraseRequired) {
		claimPriv = await claimPrivFromPassphrase(claimSecret, input.passphrase!);
		kdf = claimKdfPassphrase();
	} else {
		claimPriv = claimPrivFromSecret(claimSecret);
		kdf = claimKdfNoPass();
	}
	const C = xOnlyFromPriv(claimPriv);

	let R: Uint8Array;
	let refundSecret: Uint8Array | undefined;
	if (input.policy === 'refund_self') {
		refundSecret = randomSecret(32);
		const refundPriv = refundPrivFromSecret(refundSecret);
		R = xOnlyFromPriv(refundPriv);
	} else if (input.policy === 'donate_project') {
		if (!input.donateR || input.donateR.length !== 32) {
			throw new Error('donate_project requires 32-byte donate R pubkey');
		}
		R = input.donateR;
	} else {
		if (!input.customR || input.customR.length !== 32) {
			throw new Error('custom policy requires 32-byte R pubkey');
		}
		R = input.customR;
	}

	// network defaulting happens once, in buildGiftPayment (the lowest layer)
	const payment = buildGiftPayment({ C, R, T, network: input.network });

	return {
		claimSecret,
		claimSecretB64url: bytesToB64url(claimSecret),
		refundSecret,
		refundSecretB64url: refundSecret ? bytesToB64url(refundSecret) : undefined,
		passphraseRequired,
		kdf,
		claimPriv,
		C,
		R,
		T,
		policy: input.policy,
		payment,
		descriptor: descriptorString(
			payment.C_xonly,
			payment.R_xonly,
			T,
			payment.nums_xonly
		)
	};
}

export interface GiftScriptFields {
	C_xonly: string;
	R_xonly: string;
	T: number;
	nums_xonly: string;
	address: string;
	script_pub_key?: string;
}

export interface VerifyResult {
	ok: boolean;
	errors: string[];
}

/**
 * SPEC §5.3 integrity check: re-derive the claim pubkey C from the secret
 * (+ passphrase) and rebuild the Taproot address from the package's script
 * fields, confirming both match. Run before showing "Ready to gift" and again
 * when a claim link/package loads. A mismatch means the package is corrupt or
 * the passphrase is wrong — never spend/fund against it.
 */
export async function verifyGiftPackage(input: {
	secret: Uint8Array;
	passphrase?: string;
	passphraseRequired: boolean;
	script: GiftScriptFields;
	network?: typeof btc.TEST_NETWORK | typeof btc.NETWORK;
}): Promise<VerifyResult> {
	const errors: string[] = [];
	try {
		const claimPriv = input.passphraseRequired
			? await claimPrivFromPassphrase(input.secret, input.passphrase ?? '')
			: claimPrivFromSecret(input.secret);
		const C = xOnlyFromPriv(claimPriv);
		if (bytesToHex(C) !== input.script.C_xonly) {
			errors.push('claim pubkey C does not derive from this secret/passphrase');
		}
		const R = hexToBytesStrict(input.script.R_xonly, 32);
		const payment = buildGiftPayment({ C, R, T: input.script.T, network: input.network });
		if (payment.address !== input.script.address) {
			errors.push('address does not match the derived script');
		}
		if (input.script.script_pub_key && payment.scriptPubKeyHex !== input.script.script_pub_key) {
			errors.push('scriptPubKey does not match the derived script');
		}
		if (payment.nums_xonly !== input.script.nums_xonly) {
			errors.push('NUMS internal key mismatch');
		}
	} catch (e) {
		errors.push(e instanceof Error ? e.message : String(e));
	}
	return { ok: errors.length === 0, errors };
}
