import * as btc from '@scure/btc-signer';
import { vi } from 'vitest';
import { createGift } from '../../src/lib/crypto/create-gift';
import { claimPrivFromSecret, xOnlyFromPriv } from '../../src/lib/crypto/keys';
import type { Utxo } from '../../src/lib/esplora';

export const NET = btc.TEST_NETWORK;

/** A refund_self gift, its claim key, and a taproot destination address. */
export async function fixture() {
	const g = await createGift({ policy: 'refund_self', network: NET });
	const claimPriv = claimPrivFromSecret(g.claimSecret);
	const dest = btc.p2tr(xOnlyFromPriv(claimPriv), undefined, NET).address as string;
	return { g, claimPriv, dest };
}

export const utxo = (value: number, confirmed = true): Utxo => ({
	txid: '11'.repeat(32),
	vout: 0,
	value,
	status: { confirmed }
});

/**
 * Stub global fetch with URL-substring routing; unmatched URLs get a 404.
 * Pass `requests` to capture every request as a "url body" line.
 * Callers restore with vi.unstubAllGlobals().
 */
export function stubFetch(routes: Record<string, () => Response>, requests?: string[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: unknown, init?: { body?: unknown }) => {
			requests?.push(`${String(url)} ${String(init?.body ?? '')}`);
			const u = String(url);
			for (const [path, handler] of Object.entries(routes)) {
				if (u.includes(path)) return handler();
			}
			return new Response('not found', { status: 404 });
		})
	);
}
