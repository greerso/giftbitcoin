import { describe, it, expect } from 'vitest';
import * as btc from '@scure/btc-signer';
import { createGift } from '../../src/lib/crypto/create-gift';
import { claimPrivFromSecret, xOnlyFromPriv } from '../../src/lib/crypto/keys';
import { buildClaimTx } from '../../src/lib/claim-tx';
import type { Utxo } from '../../src/lib/esplora';

const NET = btc.TEST_NETWORK;

async function fixture() {
	const g = await createGift({ policy: 'refund_self', network: NET });
	const claimPriv = claimPrivFromSecret(g.claimSecret);
	const dest = btc.p2tr(xOnlyFromPriv(claimPriv), undefined, NET).address as string;
	return { g, claimPriv, dest };
}

const utxo = (value: number, confirmed = true): Utxo => ({
	txid: '11'.repeat(32),
	vout: 0,
	value,
	status: { confirmed }
});

describe('buildClaimTx', () => {
	it('builds, signs and finalizes a claim-path sweep', async () => {
		const { g, claimPriv, dest } = await fixture();
		const res = buildClaimTx({
			claimPriv,
			C: g.C,
			R: g.R,
			T: g.T,
			utxos: [utxo(100_000)],
			destAddress: dest,
			feeRate: 2,
			network: NET
		});
		expect(res.hex.length).toBeGreaterThan(0);
		expect(res.txid).toMatch(/^[0-9a-f]{64}$/);
		expect(res.netSats).toBe(res.grossSats - res.feeSats);
		expect(res.netSats).toBeLessThan(100_000);
		expect(res.inputCount).toBe(1);
	});

	it('sweeps multiple confirmed UTXOs and ignores unconfirmed', async () => {
		const { g, claimPriv, dest } = await fixture();
		const res = buildClaimTx({
			claimPriv,
			C: g.C,
			R: g.R,
			T: g.T,
			utxos: [utxo(60_000), { ...utxo(70_000), vout: 1 }, { ...utxo(999, false), vout: 2 }],
			destAddress: dest,
			feeRate: 2,
			network: NET
		});
		expect(res.inputCount).toBe(2);
		expect(res.grossSats).toBe(130_000);
	});

	it('rejects when there are no confirmed UTXOs', async () => {
		const { g, claimPriv, dest } = await fixture();
		expect(() =>
			buildClaimTx({
				claimPriv,
				C: g.C,
				R: g.R,
				T: g.T,
				utxos: [utxo(50_000, false)],
				destAddress: dest,
				feeRate: 2,
				network: NET
			})
		).toThrow();
	});

	it('rejects a mainnet destination address', async () => {
		const { g, claimPriv } = await fixture();
		expect(() =>
			buildClaimTx({
				claimPriv,
				C: g.C,
				R: g.R,
				T: g.T,
				utxos: [utxo(100_000)],
				destAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
				feeRate: 2,
				network: NET
			})
		).toThrow();
	});
});
