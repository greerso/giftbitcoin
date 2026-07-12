/**
 * Claim-URL payload — SPEC §5.4 (normative).
 *
 *   v1.<secret_b64url>    no passphrase; secret is HKDF ikm for the claim key
 *   v1.p.<secret_b64url>  passphrase required; secret is the Argon2id salt
 *
 * Secret material lives ONLY in the URL fragment (never the query string) and is
 * never sent to a server. base64url-unpadded, exactly 32 bytes.
 */
import { bytesToB64url, b64urlToBytes } from './keys';

export interface ParsedClaimPayload {
	secret: Uint8Array;
	passphraseRequired: boolean;
}

/** Build the fragment payload (without a leading `#`). */
export function encodeSecretPayload(secret: Uint8Array, passphraseRequired: boolean): string {
	return `v1.${passphraseRequired ? 'p.' : ''}${bytesToB64url(secret)}`;
}

/**
 * Parse a claim fragment. Accepts an optional leading `#`. Throws on any
 * malformed input rather than silently deriving a wrong key.
 */
export function parseSecretPayload(fragment: string): ParsedClaimPayload {
	const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	let passphraseRequired: boolean;
	let b64: string;
	if (frag.startsWith('v1.p.')) {
		passphraseRequired = true;
		b64 = frag.slice('v1.p.'.length);
	} else if (frag.startsWith('v1.')) {
		passphraseRequired = false;
		b64 = frag.slice('v1.'.length);
	} else {
		throw new Error('unrecognized claim payload (expected v1. or v1.p.)');
	}
	const secret = b64urlToBytes(b64, 32); // throws on bad alphabet or wrong length
	return { secret, passphraseRequired };
}
