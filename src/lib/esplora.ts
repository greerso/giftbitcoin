/**
 * Read-only + broadcast Esplora client (mempool.space testnet4 by default).
 * The indexer base is user-overridable (SPEC §10.4 privacy goal) via localStorage;
 * a custom host must also be added to the CSP connect-src allowlist to be reachable.
 */
import { DEFAULT_ESPLORA_BASE } from '$config/network';

const OVERRIDE_KEY = 'gb_esplora_base';

export function esploraBase(): string {
	try {
		return localStorage.getItem(OVERRIDE_KEY) || DEFAULT_ESPLORA_BASE;
	} catch {
		return DEFAULT_ESPLORA_BASE;
	}
}

export interface Utxo {
	txid: string;
	vout: number;
	value: number; // sats
	status: { confirmed: boolean; block_height?: number };
}

export async function getUtxos(address: string): Promise<Utxo[]> {
	// encodeURIComponent: the claim page fetches the address from an untrusted link
	// fragment before package verification, so keep it from steering the URL path.
	const r = await fetch(`${esploraBase()}/address/${encodeURIComponent(address)}/utxo`);
	if (!r.ok) throw new Error(`indexer error ${r.status}`);
	return r.json();
}

export function confirmedValue(utxos: Utxo[]): number {
	return utxos.filter((u) => u.status.confirmed).reduce((s, u) => s + u.value, 0);
}

export function hasMempool(utxos: Utxo[]): boolean {
	return utxos.some((u) => !u.status.confirmed);
}

/**
 * sat/vB. The default base (mempool.space) serves /v1/fees/recommended, but a
 * user-overridden vanilla Esplora (SPEC §10.4) only serves /fee-estimates
 * (keyed by confirmation target in blocks; ~30 min ≈ 3) — try both shapes so
 * an override doesn't silently degrade to the floor. Estimates can be
 * fractional and sub-1 (testnet4 idles at 0.1–0.5); clamp to Core's 1 sat/vB
 * minrelay floor or the tx can't be broadcast at all.
 */
const FEE_SHAPES: Array<[string, (j: Record<string, unknown>) => number]> = [
	['/v1/fees/recommended', (j) => Number(j?.halfHourFee) || Number(j?.hourFee)],
	['/fee-estimates', (j) => Number(j?.['3']) || Number(j?.['6'])]
];

export async function recommendedFeeRate(): Promise<number> {
	for (const [path, pick] of FEE_SHAPES) {
		try {
			const r = await fetch(`${esploraBase()}${path}`);
			if (!r.ok) continue;
			const rate = pick(await r.json());
			if (rate > 0) return Math.max(1, rate);
		} catch {
			/* try the next shape */
		}
	}
	return 2; // conservative floor when no estimator is reachable
}

/** Broadcast a signed raw tx hex; returns the txid or throws with the node's reason. */
export async function broadcastTx(hex: string): Promise<string> {
	const r = await fetch(`${esploraBase()}/tx`, { method: 'POST', body: hex });
	const text = (await r.text()).trim();
	if (!r.ok) throw new Error(text || `broadcast failed (${r.status})`);
	return text;
}
