import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	claimPrivFromSecret,
	refundPrivFromSecret,
	xOnlyFromPriv,
	hexToBytesStrict,
	bytesToHex
} from '../../src/lib/crypto/keys';
import { buildGiftPayment, descriptorString } from '../../src/lib/crypto/gift-script';
import * as btc from '@scure/btc-signer';

const vectors = JSON.parse(
	readFileSync(new URL('../../vectors/v1.json', import.meta.url), 'utf8')
);
const g = vectors.sample_gift;

const SECRET = hexToBytesStrict(g.claim_secret);
const REFUND_SECRET = hexToBytesStrict(g.refund_secret);

describe('gift Taproot script', () => {
	const C = xOnlyFromPriv(claimPrivFromSecret(SECRET));
	const R = xOnlyFromPriv(refundPrivFromSecret(REFUND_SECRET));
	const T = g.T;

	it('builds stable testnet address', () => {
		const p1 = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const p2 = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		expect(p1.address).toBe(p2.address);
		expect(p1.address.startsWith('tb1p')).toBe(true);
		expect(p1.scriptPubKey.length).toBe(34); // OP_1 + 32 push
	});

	it('changes address when T changes', () => {
		const a = buildGiftPayment({ C, R, T: 4320, network: btc.TEST_NETWORK });
		const b = buildGiftPayment({ C, R, T: 12960, network: btc.TEST_NETWORK });
		expect(a.address).not.toBe(b.address);
	});

	it('changes address when C changes', () => {
		const C2 = xOnlyFromPriv(claimPrivFromSecret(REFUND_SECRET));
		const a = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const b = buildGiftPayment({ C: C2, R, T, network: btc.TEST_NETWORK });
		expect(a.address).not.toBe(b.address);
	});

	it('matches the frozen golden vector in vectors/v1.json', () => {
		const p = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		expect(bytesToHex(C)).toBe(g.C_xonly);
		expect(bytesToHex(R)).toBe(g.R_xonly);
		expect(p.address).toBe(g.address);
		expect(p.scriptPubKeyHex).toBe(g.script_pub_key);
		expect(p.nums_xonly).toBe(g.nums_xonly);
		expect(bytesToHex(p.claimLeaf)).toBe(g.claim_leaf);
		expect(bytesToHex(p.expiryLeaf)).toBe(g.expiry_leaf);
	});

	it('emits the canonical miniscript descriptor for the golden vector', () => {
		const p = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		expect(descriptorString(p.C_xonly, p.R_xonly, T, p.nums_xonly)).toBe(g.descriptor);
	});

	it('expiry leaf is <T> CSV VERIFY <R> CHECKSIG (not DROP)', () => {
		const p = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const ops = btc.Script.decode(p.expiryLeaf);
		// [ <T bytes>, 'CHECKSEQUENCEVERIFY', 'VERIFY', <R>, 'CHECKSIG' ]
		expect(ops.length).toBe(5);
		expect(ops[1]).toBe('CHECKSEQUENCEVERIFY');
		expect(ops[2]).toBe('VERIFY'); // regression guard for the DROP bug
		expect(ops[4]).toBe('CHECKSIG');
		expect(ops[3] instanceof Uint8Array && bytesToHex(ops[3])).toBe(g.R_xonly);
	});

	it('encodes T with a minimal push (OP_1..OP_16 for T<=16)', () => {
		// OP_1 = 0x51, OP_16 = 0x60; CSV=0xb2, VERIFY=0x69
		const t1 = buildGiftPayment({ C, R, T: 1, network: btc.TEST_NETWORK });
		expect(bytesToHex(t1.expiryLeaf).startsWith('51b269')).toBe(true);
		const t16 = buildGiftPayment({ C, R, T: 16, network: btc.TEST_NETWORK });
		expect(bytesToHex(t16.expiryLeaf).startsWith('60b269')).toBe(true);
		// T=17 is a 1-byte data push (0x01 0x11)
		const t17 = buildGiftPayment({ C, R, T: 17, network: btc.TEST_NETWORK });
		expect(bytesToHex(t17.expiryLeaf).startsWith('0111b269')).toBe(true);
	});

	it('rejects an off-curve R (would be an unsignable expiry path)', () => {
		// x=7 has no y on secp256k1 — a bad custom/donate R must be rejected, not
		// silently built into a fundable-but-unrecoverable address (Reviewer B2).
		const offCurve = hexToBytesStrict(
			'0000000000000000000000000000000000000000000000000000000000000007'
		);
		expect(() => buildGiftPayment({ C, R: offCurve, T, network: btc.TEST_NETWORK })).toThrow();
	});

	it('claim-path spend finalizes (address is spendable)', () => {
		const claimPriv = claimPrivFromSecret(SECRET);
		const p = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const tx = new btc.Transaction({ allowUnknownOutputs: true });
		tx.addInput({
			txid: new Uint8Array(32),
			index: 0,
			witnessUtxo: { script: p.scriptPubKey, amount: 100000n },
			...p.payment
		});
		tx.addOutput({ script: btc.p2tr(C, undefined, btc.TEST_NETWORK).script, amount: 99000n });
		tx.signIdx(claimPriv, 0);
		tx.finalize();
		expect(tx.hex.length).toBeGreaterThan(0);
	});
});
