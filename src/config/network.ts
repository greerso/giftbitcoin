/** Network and product config — SPEC §14.0 / §10.5 */

/** Public brand domain (production) */
export const BRAND_DOMAIN = 'giftbitcoin.app';
export const BRAND_NAME = 'Gift Bitcoin';
export const PRODUCTION_ORIGIN = `https://${BRAND_DOMAIN}`;

export type NetworkId = 'testnet4' | 'regtest';

export interface NetworkConfig {
	id: NetworkId;
	/** Package `network` field */
	packageNetwork: string;
	bech32: string;
	bech32m: string;
	pubKeyHash: number;
	scriptHash: number;
	wif: number;
	/** Human label for banner */
	label: string;
}

/** Bitcoin testnet4 params (same address HRP family as testnet3 for bech32: tb) */
export const TESTNET4: NetworkConfig = {
	id: 'testnet4',
	packageNetwork: 'testnet4',
	bech32: 'tb',
	bech32m: 'tb',
	pubKeyHash: 0x6f,
	scriptHash: 0xc4,
	wif: 0xef,
	label: 'Bitcoin testnet4'
};

export const REGTEST: NetworkConfig = {
	id: 'regtest',
	packageNetwork: 'regtest',
	bech32: 'bcrt',
	bech32m: 'bcrt',
	pubKeyHash: 0x6f,
	scriptHash: 0xc4,
	wif: 0xef,
	label: 'Bitcoin regtest'
};

/** Active product network for v1 builds */
export const ACTIVE_NETWORK: NetworkConfig = TESTNET4;

/**
 * Min gift amount (sats) — create UX floor. SPEC §8 defaults to 100_000 but calls
 * it tunable; lowered for the testnet4 demo so the USD presets ($25+) are usable.
 * Still well above the taproot dust threshold (~330 sats).
 */
export const MIN_GIFT_SATS = 10_000;

/** Default tip as fraction of gift */
export const DEFAULT_TIP_FRACTION = 0.03;

/** Expiry T presets in blocks (~30/90/180 days at 144 blk/day) */
export const T_PRESETS = {
	days30: 4_320,
	days90: 12_960,
	days180: 25_920
} as const;

export const DEFAULT_T_BLOCKS = T_PRESETS.days90;

/**
 * Placeholder tip receive address (testnet). Replace before any real use.
 * Must not be able to spend gift vaults.
 */
export const PROJECT_TIP_ADDRESS_TESTNET = '';

/**
 * Donate policy: x-only pubkey hex (32 bytes) for R when policy=donate_project.
 * Empty until project key is generated offline.
 */
export const DONATE_R_XONLY_HEX = '';

/** Default public Esplora base (set when known; user can override) */
export const DEFAULT_ESPLORA_BASE = 'https://mempool.space/testnet4/api';

export const DEFAULT_EXPLORER_TX = 'https://mempool.space/testnet4/tx/';
