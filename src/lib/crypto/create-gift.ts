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
	claimSecretHex: string;
	refundSecret?: Uint8Array;
	refundSecretHex?: string;
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

	const payment = buildGiftPayment({
		C,
		R,
		T,
		network: input.network ?? btc.TEST_NETWORK
	});

	return {
		claimSecret,
		claimSecretHex: bytesToHex(claimSecret),
		refundSecret,
		refundSecretHex: refundSecret ? bytesToHex(refundSecret) : undefined,
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
