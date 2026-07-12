/** Network and product config — SPEC §14.0 / §10.5 */
import * as btc from '@scure/btc-signer';

/** Public brand domain (production) */
export const BRAND_DOMAIN = 'giftbitcoin.app';

/**
 * The SPEC §14.0 network pin: address building/validation defaults and the
 * package `network` field all read this. Crypto/address defaults are
 * single-sourced here; UX copy and the claim page's mainnet-address heuristic
 * (`/^(bc1|[13])/`) still assume testnet and need their own pass when this
 * ever changes. testnet4 shares testnet3's params for scure (`tb` HRP).
 */
export const ACTIVE_NETWORK = {
	/** Package `network` field (SPEC §5.2) */
	packageNetwork: 'testnet4',
	/** scure-btc-signer network params */
	scure: btc.TEST_NETWORK
} as const;

/**
 * Min gift amount (sats) — create UX floor. SPEC §8 defaults to 100_000 but calls
 * it tunable; lowered for the testnet4 demo so the USD presets ($25+) are usable.
 * Still well above the taproot dust threshold (~330 sats).
 */
export const MIN_GIFT_SATS = 10_000;

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
