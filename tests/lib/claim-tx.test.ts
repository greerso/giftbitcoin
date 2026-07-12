import { describe, it, expect } from 'vitest';
import { buildClaimTx } from '../../src/lib/claim-tx';
import { NET, fixture, utxo } from './helpers';

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

	it('applies the 546-sat dust floor for a legacy destination', async () => {
		const { g, claimPriv, dest } = await fixture();
		const build = (value: number, destAddress: string) =>
			buildClaimTx({
				claimPriv,
				C: g.C,
				R: g.R,
				T: g.T,
				utxos: [utxo(value)],
				destAddress,
				feeRate: 1,
				network: NET
			});
		const legacyDest = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'; // testnet P2PKH
		// net ≈ 500 sats: above the 330 taproot floor, below the 546 legacy floor
		expect(() => build(636, legacyDest)).toThrow(/too small/);
		expect(build(636, dest).netSats).toBeGreaterThan(330);
		// and a legacy destination CAN build once its own floor is cleared —
		// pins that the pkh floor is 546-ish, not something absurdly higher
		expect(build(700, legacyDest).netSats).toBeGreaterThan(546);
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
