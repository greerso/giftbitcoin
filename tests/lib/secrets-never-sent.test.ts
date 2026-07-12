import { describe, it, expect, vi, afterEach } from 'vitest';
import { bytesToHex } from '../../src/lib/crypto/keys';
import { buildClaimTx } from '../../src/lib/claim-tx';
import { getUtxos, recommendedFeeRate, broadcastTx } from '../../src/lib/esplora';
import { NET, fixture, utxo, stubFetch } from './helpers';

/**
 * SPEC §14.3.3 (claim flow): the claim secret must never appear in outbound request URLs or
 * bodies in the claim flow. Drives the real esplora client (UTXO lookup, fee estimate, broadcast)
 * against a stubbed fetch that records every request, then scans the log for
 * every piece of secret material a gift carries. The send flow's `/api/send` relay is the §5.1
 * carve-out and is tested in `tests/worker/send.test.ts`.
 */
describe('secrets never sent (SPEC §14.3.3)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('claim-flow network traffic contains no secret material', async () => {
		const requests: string[] = [];
		stubFetch(
			{
				'/utxo': () => new Response(JSON.stringify([utxo(100_000)])),
				'/v1/fees/recommended': () => new Response(JSON.stringify({ halfHourFee: 2 })),
				'/tx': () => new Response('ab'.repeat(32))
			},
			requests
		);

		const { g, claimPriv, dest } = await fixture();
		const utxos = await getUtxos(g.payment.address);
		const feeRate = await recommendedFeeRate();
		const tx = buildClaimTx({
			claimPriv,
			C: g.C,
			R: g.R,
			T: g.T,
			utxos,
			destAddress: dest,
			feeRate,
			network: NET
		});
		await broadcastTx(tx.hex);

		// sanity: the flow really did hit the network surface, broadcast included
		expect(requests.length).toBeGreaterThanOrEqual(3);
		expect(requests.some((r) => r.includes(tx.hex))).toBe(true);

		const secrets = [
			g.claimSecretB64url,
			bytesToHex(g.claimSecret),
			bytesToHex(g.claimPriv),
			g.refundSecretB64url!,
			bytesToHex(g.refundSecret!)
		];
		for (const s of secrets) expect(s.length).toBeGreaterThan(0);
		for (const req of requests) {
			for (const s of secrets) expect(req).not.toContain(s);
		}
	});
});
