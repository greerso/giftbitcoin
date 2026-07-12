/**
 * Build + sign + finalize a claim-path spend (the `pk(C)` leaf) sweeping every
 * confirmed gift UTXO to the recipient's address, single output, fee = feeRate ×
 * vsize. Testnet4. The expiry/refund path (custom CSV leaf) needs a manual
 * witness and is not built here.
 */
import * as btc from '@scure/btc-signer';
import type { Utxo } from './esplora';
import { buildGiftPayment } from '$lib/crypto/gift-script';

export interface ClaimTxResult {
	hex: string;
	txid: string;
	feeSats: number;
	netSats: number;
	grossSats: number;
	inputCount: number;
}

/**
 * Per destination script type: relay dust floor (Bitcoin Core's
 * dustRelayFee=3000 defaults) and serialized output size for the pre-build fee
 * estimate. The floor belongs to the OUTPUT we create, so a legacy destination
 * needs 546 even though the gift input is taproot. Dust checks below use ≤
 * (deliberately 1 sat conservative vs Core's `value < dust`).
 */
const OUT_INFO: Record<string, { dust: number; vbytes: number }> = {
	pkh: { dust: 546, vbytes: 34 },
	sh: { dust: 540, vbytes: 32 },
	wpkh: { dust: 294, vbytes: 31 },
	wsh: { dust: 330, vbytes: 43 },
	tr: { dust: 330, vbytes: 43 }
};

export function buildClaimTx(input: {
	claimPriv: Uint8Array;
	C: Uint8Array;
	R: Uint8Array;
	T: number;
	utxos: Utxo[];
	destAddress: string;
	feeRate: number; // sat/vB
	network: typeof btc.TEST_NETWORK | typeof btc.NETWORK;
}): ClaimTxResult {
	const confirmed = input.utxos.filter((u) => u.status.confirmed);
	if (confirmed.length === 0) throw new Error('This gift has no confirmed funds to redeem yet.');
	const gross = confirmed.reduce((s, u) => s + u.value, 0);

	const gift = buildGiftPayment({ C: input.C, R: input.R, T: input.T, network: input.network });
	// Decoding against the active network throws on a wrong-network (mainnet) or
	// malformed destination — the §14.3.6 mainnet-address guard.
	const decodedDest = btc.Address(input.network).decode(input.destAddress);
	const outScript = btc.OutScript.encode(decodedDest);
	// scure 1.8 decode() throws on unknown types; ?? guards future scure/witness versions
	const { dust: dustSats, vbytes: outBytes } = OUT_INFO[decodedDest.type] ?? {
		dust: 546,
		vbytes: 43
	};

	const make = (feeSats: number) => {
		const tx = new btc.Transaction();
		for (const u of confirmed) {
			tx.addInput({
				txid: u.txid,
				index: u.vout,
				witnessUtxo: { script: gift.scriptPubKey, amount: BigInt(u.value) },
				...gift.payment // the raw p2tr carries tapLeafScript/control blocks for signing
			});
		}
		tx.addOutput({ script: outScript, amount: BigInt(gross - feeSats) });
		for (let i = 0; i < confirmed.length; i++) tx.signIdx(input.claimPriv, i);
		// finalize() walks tapLeafScript in (stable-sorted) order and spends the
		// FIRST leaf it can resolve — it does not skip past a leaf it can't parse.
		// This works because buildGiftPayment lists the pk(C) claim leaf first;
		// if the unknown-shape CSV expiry leaf were encountered first, scure
		// throws `Finalize: Unknown tapLeafScript` (a loud failure, pinned by the
		// claim-tx tests) rather than falling through to the claim leaf. Keep the
		// claim leaf first in gift-script.ts.
		tx.finalize();
		return tx;
	};

	if (!(input.feeRate > 0) || input.feeRate > 1000) {
		throw new Error(`Unreasonable fee rate from the indexer: ${input.feeRate} sat/vB`);
	}
	// Estimate, then refine to the REAL vsize once the witness sizes are known and
	// always apply that fee (never ship a knowingly-underpaying tx near the dust
	// boundary — that would be rejected by the relay floor instead of a clear error).
	let feeSats = Math.ceil((11 + confirmed.length * 82 + outBytes) * input.feeRate);
	if (gross - feeSats <= dustSats) {
		throw new Error('The amount is too small to cover the network fee right now.');
	}
	let tx = make(feeSats);
	const refined = Math.ceil(tx.vsize * input.feeRate);
	if (refined !== feeSats) {
		if (gross - refined <= dustSats) {
			throw new Error('The amount is too small to cover the network fee right now.');
		}
		feeSats = refined;
		tx = make(feeSats);
	}

	return {
		hex: tx.hex,
		txid: tx.id,
		feeSats,
		netSats: gross - feeSats,
		grossSats: gross,
		inputCount: confirmed.length
	};
}
