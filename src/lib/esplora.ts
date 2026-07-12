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
	const r = await fetch(`${esploraBase()}/address/${address}/utxo`);
	if (!r.ok) throw new Error(`indexer error ${r.status}`);
	return r.json();
}

export function confirmedValue(utxos: Utxo[]): number {
	return utxos.filter((u) => u.status.confirmed).reduce((s, u) => s + u.value, 0);
}

export function hasMempool(utxos: Utxo[]): boolean {
	return utxos.some((u) => !u.status.confirmed);
}

/** sat/vB; conservative fallback if the fee API is unreachable. */
export async function recommendedFeeRate(): Promise<number> {
	try {
		const r = await fetch(`${esploraBase()}/v1/fees/recommended`);
		if (r.ok) {
			const j = await r.json();
			return Number(j?.halfHourFee) || Number(j?.hourFee) || 2;
		}
	} catch {
		/* fall through */
	}
	return 2;
}

/** Broadcast a signed raw tx hex; returns the txid or throws with the node's reason. */
export async function broadcastTx(hex: string): Promise<string> {
	const r = await fetch(`${esploraBase()}/tx`, { method: 'POST', body: hex });
	const text = (await r.text()).trim();
	if (!r.ok) throw new Error(text || `broadcast failed (${r.status})`);
	return text;
}
