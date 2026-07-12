# Send Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the send mechanism per `docs/superpowers/specs/2026-07-12-send-mechanism-design.md`: SPEC amendments, generated-only 4-word passphrases, delivery choice at create, Web Share tier, three-segment QR fragment, claim normalization with back-compat, and a Cloudflare Worker `/api/send` email relay.

**Architecture:** The app stays fully static (SvelteKit adapter-static). The only server component is a new Cloudflare Worker at `worker/` routed to `giftbitcoin.app/api/send`, which shares the repo's crypto modules via relative imports. All passphrase generation is client-side; the Worker never sees a passphrase and stores nothing persistent.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, vitest, @noble/@scure crypto, hash-wasm Argon2id, new dep `qr` (paulmillr, zero-dep QR encoder), Cloudflare Workers (send_email binding, rate-limit bindings, Cache API, Turnstile).

## Global Constraints

Copied from the design spec / SPEC.md — every task's requirements include these:

- Passphrases are **always site-generated**: 4 words, EFF large wordlist (7776 words), CSPRNG with rejection sampling, lowercase, single-space separated, NFC-normalized. Human-chosen passphrases are removed. Entropy = 4 × log2(7776) ≈ 51.7 bits.
- The passphrase is **never** stored in any package variant (SPEC §4.2.4: "Passphrase is never stored"), never sent to any server, and never generated server-side.
- The 4 words are shown on screen at create time and re-shown on the share step.
- Passphrase **forced** for server-sent (email) gifts; **opt-in** for self-sent gifts.
- Copy-link and share buttons **always** emit the two-segment link `g1.<share_card_b64url>`. Only the QR for self-sent opt-in gifts uses the three-segment form `g1.<share_card_b64url>.<passphrase_b64url>` (payload = base64url of UTF-8 NFC passphrase).
- `/api/send` **rejects three-segment links outright**, requires `claim.passphrase_required === true`, recomputes the taproot address from the card's script fields (NUMS/C/R/T) and requires it to equal `script.address`, requires ≥1 confirmation via a server-side esplora call with a **hard 5 s timeout that fails closed** (no email on esplora failure), and **stores nothing persistent** (ephemeral rate-limit counters + 60 s funding-check cache only; no log line containing the link).
- Anti-abuse: required Turnstile token, rate limits per client IP (`CF-Connecting-IP`) and per gift address (counters keyed on SHA-256(address), never the link).
- CSP: add `https://challenges.cloudflare.com` to `script-src` and `frame-src` in `svelte.config.js` — nothing else changes in the CSP.
- Claim passphrase input: case-insensitive, whitespace-collapsed, then NFC-normalized before Argon2id. **Back-compat:** derive with normalized input first; on commitment mismatch retry once with the raw NFC-only input. After 3 failed derivations show "check the words with the sender". No lockout.
- Existing Argon2id parameters unchanged: m=65536, t=3, p=1, out=32 (SPEC §4.2.4).
- Exact copy strings (verbatim):
  - Claim prompt: `Enter the 4 secret words from the sender.`
  - Post-send instruction: `Now text or tell them these 4 words — the email alone can't claim the gift.`
  - Send confirmation must say the email was **handed to the mail system** ("confirm it arrived when you send them the 4 words"), never "delivered".
  - Email body: "Someone sent you a Bitcoin gift" + claim link + "the sender will give you 4 secret words to open it." Never the passphrase.
- Error handling: `/api/send` failure → inline error + "copy the link and send it yourself" fallback. `navigator.share` rejection → silent fall back to the copy button.
- Network: testnet4 only (`card.network === 'testnet4'`, scure `btc.TEST_NETWORK`).
- Run all tests with `npm test` (vitest); typecheck with `npm run check`. Both must pass before each commit.
- Commit style follows repo history: `feat:`/`fix:`/`docs:` conventional prefixes, imperative.

## File Structure

| File | Responsibility |
|---|---|
| `SPEC.md` | Amendments (Task 1) |
| `tests/lib/secrets-never-sent.test.ts` | Comment re-scope only (Task 1) |
| `src/lib/crypto/eff-wordlist.ts` | Generated: 7776-word array (Task 2) |
| `src/lib/crypto/passphrase.ts` | `generatePassphrase()`, `normalizePassphraseInput()` (Task 2) |
| `tests/lib/passphrase.test.ts` | Task 2 tests |
| `src/lib/gift-package.ts` | 3-segment fragment parse/build, `verifyShareCardPassphrase` (Tasks 3, 4) |
| `tests/lib/gift-package.test.ts` | Tasks 3, 4 tests (new file) |
| `src/routes/create/+page.svelte` | Delivery choice, generated words, share tier, email form (Tasks 5, 6, 11) |
| `src/lib/components/Qr.svelte` | SVG QR renderer component (Task 6) |
| `src/routes/c/+page.svelte` | Claim normalization/back-compat/embedded passphrase (Task 7) |
| `worker/src/types.ts` | Hand-written binding interfaces (Task 8) |
| `worker/src/send.ts` | Validation, recompute, gates, email logic (Tasks 8–10) |
| `worker/src/index.ts` | Worker entry (Task 10) |
| `worker/wrangler.jsonc` | Worker config (Task 8) |
| `tests/worker/send.test.ts` | Worker tests (Tasks 8–10) |
| `src/config/send.ts` | Turnstile site key + send API path (Task 11) |
| `svelte.config.js` | CSP additions (Task 11) |
| `docs/DEPLOY.md`, `TODO.md` | Deployment doc + queue update (Task 12) |

---

### Task 1: SPEC.md amendments

**Files:**
- Modify: `SPEC.md`
- Modify: `tests/lib/secrets-never-sent.test.ts` (header comment only)

**Interfaces:** none (docs). Later tasks cite the amended sections.

- [ ] **Step 1: Bump version + changelog line**

`SPEC.md` line 3 area holds the version (currently v0.2.6 — find the version marker near the top and any changelog). Bump to **v0.3.0** with a one-line note: `v0.3.0 — send mechanism: transient email relay carve-outs (§5.1/§10.1/§13/§14.3.3), generated-only passphrases (§4.2.4), three-segment QR fragment (§5.4), Turnstile CSP entry (§13), per docs/superpowers/specs/2026-07-12-send-mechanism-design.md.`

- [ ] **Step 2: §5.1 carve-out (line ~231)**

Change the bullet `- Claim secret **must not** be sent to the website process` to:

```markdown
- Claim secret **must not** be sent to the website process — with one carve-out: a **passphrase-committed** `share_card` (i.e. `claim.passphrase_required: true`) MAY be transiently relayed via `POST /api/send` for email delivery. It is never persisted and never logged; the passphrase (the second factor the address commits to) is never sent to any server.
```

- [ ] **Step 3: §10.1 add `/api/send` row (line ~620)**

Add to the Allowed-components table:

```markdown
| `/api/send` email relay (Cloudflare Worker) | Send-and-forget relay of a passphrase-committed `share_card` link to a recipient email. Transient only: no DB, no resend, no log line containing the link; ephemeral rate-limit counters + 60 s funding-check cache are the only state. Requires Turnstile + funded-address check (recomputed server-side). |
```

- [ ] **Step 4: §13 scope "No secret to API" + CSP row (lines ~732, ~737)**

- Row `| No secret to API | Fragment never appended to fetch URLs |` → `| No secret to API (claim flow) | Fragment never appended to fetch URLs in the claim flow. The send flow's §5.1 carve-out applies to /api/send only. |`
- Row `| CSP | ...` → `| CSP | `default-src 'self'`; `connect-src` indexer allowlist; `script-src`/`frame-src` additionally allow `https://challenges.cloudflare.com` (Turnstile on the send form — site-wide because SvelteKit CSP is one config) |`

- [ ] **Step 5: §14.3.3 re-scope (line ~786)**

`3. Automated test: claim secret never appears in simulated server request URLs/bodies.` → `3. Automated test: claim secret never appears in simulated server request URLs/bodies **in the claim flow** (the send flow relays the share_card under the §5.1 carve-out and is excluded).`

Also update the header comment of `tests/lib/secrets-never-sent.test.ts` to note the scope: the test covers the claim flow; the send flow's `/api/send` relay is the §5.1 carve-out, tested in `tests/worker/send.test.ts`. No assertion changes.

- [ ] **Step 6: §3.1 trust-model row (after line ~63)**

Add below the Website process row:

```markdown
| **Email-relay link holders** (email delivery only) | The server MAY transiently relay a passphrase-protected `share_card` via `/api/send`; it never persists it and never sees the passphrase. The relay creates additional link holders: **Cloudflare** (one party wearing two hats — the edge sees the POST body, and Email Service delivery logs may retain sent bodies), the **recipient mailbox** (indefinitely), and **corporate mail link-rewriters** (Outlook SafeLinks / Proofpoint wrappers embed the full URL, fragment included). All are mitigated by the forced ≥51.7-bit generated passphrase (~$1.8e8 to crack at current Argon2id params) — that retention is why the passphrase is forced for email. | No (link alone insufficient) |
```

(Adjust cell count to the table's actual columns.)

- [ ] **Step 7: §2 Non-goals (line ~39)**

- Row `| Server-held claim secrets | ... |` → `| Server-held claim secrets ("held" = persisted; transient §5.1 relay excluded) | Breaks "legal doesn't matter by design" |`
- Add rows:

```markdown
| Scheduled email delivery / resend | Requires persistent server state (send-and-forget only) |
| One-time-view link retrieval | Email prefetch bots burn the view — net-negative for money |
| Telegram / X / Messenger share integrations | Each leaks the link to the platform (server-side storage, t.co wrapping, Meta crawlers) |
```

- [ ] **Step 8: §4.2.4 generated-only (line ~163)**

After the "Passphrase is never stored" bullet, add:

```markdown
- Passphrases are **always site-generated**: 4 words from the EFF large wordlist (7776 words, 4 × log2(7776) ≈ 51.7 bits), CSPRNG with rejection sampling, lowercase, single-space separated, NFC-normalized. Human-chosen passphrases are removed from the product (2026-07-12 decision; crack economics in the send-mechanism design doc). Claim input is case-insensitive and whitespace-collapsed before NFC; on commitment mismatch the client retries once with the raw NFC-only input so pre-existing human-passphrase gifts stay claimable.
```

- [ ] **Step 9: §7.1 step 6 (line ~422)**

`6. Optional "Require passphrase" (recommended if sharing via email/chat).` → `6. **Delivery choice** — "How will you deliver it?": *I'll share it myself* (optional generated-passphrase toggle) or *Email it for them* (passphrase forced, generated immediately; `refund_self` default). A gift created without a passphrase can never use email delivery (the address commitment is immutable once funded); the reverse is fine. The 4 generated words are shown at create and re-shown at share; they are never stored in any package.`

- [ ] **Step 10: §12.1 copy row (line ~717)**

`- Explain passphrase as second factor when sharing via email/chat` → `- Delivery choice explains the generated 4 words as a second factor sent over a different channel ("Now text or tell them these 4 words — the email alone can't claim the gift"); email confirmation says handed to the mail system, never "delivered"`

- [ ] **Step 11: §5.4 three-segment grammar (payload table, line ~311)**

Add a row to the payload table:

```markdown
| `g1.<share_card_b64url>.<passphrase_b64url>` | Optional third dot-separated segment: base64url of the UTF-8 NFC passphrase. Emitted **only** by the QR rendering for self-sent passphrase-opt-in gifts (single-scan in-person handoff, client-side scan only — never emailed, never in copy/share links). Dots don't occur in base64url so parsing stays unambiguous; two-segment links are unchanged. Parsers (`/c`, `/recover`, create self-check) accept and ignore/consume the third segment; `/api/send` rejects it outright. On a failed derive from the embedded passphrase the claim page falls back to the manual prompt. |
```

- [ ] **Step 12: Recommended-share-UX (in §5.4, replace the "Recommended v1 share UX" paragraph, line ~328)**

```markdown
**Recommended v1 share UX (send mechanism, 2026-07-12):** Primary = Web Share API (`navigator.share({url})`, shown when `navigator.canShare?.({url}) ?? !!navigator.share`) — covers AirDrop/iMessage/WhatsApp/Signal/anything installed, fragment survives into the OS share sheet, zero server involvement. Fallback = copy-link button (mandatory: Firefox desktop and desktop-Linux Chromium lack Web Share). Optional dedicated buttons: WhatsApp `https://wa.me/?text=<urlencoded link>` and Messages `sms:?&body=<urlencoded link>` (iOS-compatible ampersand form) — the only safe per-messenger prefill links. Explicitly not offered: Telegram, X, Messenger (each leaks the link to the platform), Nostr (niche). One QR = the `g1.` claim URL (three-segment variant for self-sent opt-in gifts only); human also gets the `g1.` link as text. Tier 2 = `/api/send` email relay (§10.1).
```

- [ ] **Step 13: Verify + commit**

Run: `npm test` (should stay green — docs + comment only) and skim the diff for broken markdown tables.

```bash
git add SPEC.md tests/lib/secrets-never-sent.test.ts
git commit -m "docs: SPEC v0.3.0 — send-mechanism carve-outs, generated passphrases, 3-segment grammar"
```

---

### Task 2: EFF wordlist + passphrase module

**Files:**
- Create: `src/lib/crypto/eff-wordlist.ts` (generated)
- Create: `src/lib/crypto/passphrase.ts`
- Test: `tests/lib/passphrase.test.ts`

**Interfaces:**
- Produces: `EFF_WORDLIST: readonly string[]` (7776 entries); `generatePassphrase(): string` (4 words, single-space, lowercase, NFC); `normalizePassphraseInput(input: string): string`.
- Consumed by: create page (Task 5), gift-package back-compat verify (Task 4), claim page (Task 7).

- [ ] **Step 1: Vendor the wordlist**

```bash
curl -fsSL https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt -o /tmp/eff.txt
wc -l /tmp/eff.txt   # expect 7776
node -e "
const fs=require('fs');
const words=fs.readFileSync('/tmp/eff.txt','utf8').trim().split('\n').map(l=>l.split('\t')[1]);
if(words.length!==7776) throw new Error('count '+words.length);
if(new Set(words).size!==7776) throw new Error('dupes');
if(!words.every(w=>/^[a-z]+$/.test(w))) throw new Error('non a-z word');
fs.writeFileSync('src/lib/crypto/eff-wordlist.ts',
'/** EFF large wordlist (eff.org/dice) — 7776 words, generated from eff_large_wordlist.txt. Do not edit. */\nexport const EFF_WORDLIST: readonly string[] = '+JSON.stringify(words)+';\n');
"
```

If the network fetch fails, report BLOCKED — do not substitute another wordlist.

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/passphrase.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EFF_WORDLIST } from '../../src/lib/crypto/eff-wordlist';
import { generatePassphrase, normalizePassphraseInput } from '../../src/lib/crypto/passphrase';

describe('EFF wordlist', () => {
	it('has 7776 unique lowercase words', () => {
		expect(EFF_WORDLIST.length).toBe(7776);
		expect(new Set(EFF_WORDLIST).size).toBe(7776);
		for (const w of EFF_WORDLIST) expect(w).toMatch(/^[a-z]+$/);
	});
});

describe('generatePassphrase', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns 4 wordlist words, single-space, NFC', () => {
		const p = generatePassphrase();
		const words = p.split(' ');
		expect(words.length).toBe(4);
		for (const w of words) expect(EFF_WORDLIST).toContain(w);
		expect(p).toBe(p.normalize('NFC'));
		expect(p).not.toMatch(/\s\s|^\s|\s$/);
	});

	it('rejection-samples: values ≥ 62208 are discarded, not folded', () => {
		// 62208 = 7776 * 8 — the largest multiple of 7776 that fits in uint16.
		// Feed: one rejected value (65535), then 62207 (→ index 7775), then three 0s.
		const feed = [65535, 62207, 0, 0, 0];
		let i = 0;
		vi.stubGlobal('crypto', {
			getRandomValues: (arr: Uint16Array) => {
				for (let j = 0; j < arr.length; j++) arr[j] = feed[Math.min(i++, feed.length - 1)];
				return arr;
			}
		});
		const p = generatePassphrase();
		const words = p.split(' ');
		// 62207 % 7776 = 7775 → last word; 65535 must NOT have produced a word
		expect(words[0]).toBe(EFF_WORDLIST[7775]);
		expect(words.slice(1)).toEqual([EFF_WORDLIST[0], EFF_WORDLIST[0], EFF_WORDLIST[0]]);
	});

	it('duplicate words are permitted (independent draws)', () => {
		vi.stubGlobal('crypto', {
			getRandomValues: (arr: Uint16Array) => arr.fill(42)
		});
		expect(generatePassphrase()).toBe(Array(4).fill(EFF_WORDLIST[42]).join(' '));
	});
});

describe('normalizePassphraseInput', () => {
	it('lowercases, collapses whitespace, trims, NFC-normalizes', () => {
		expect(normalizePassphraseInput('  Correct \t Horse\nbattery STAPLE ')).toBe(
			'correct horse battery staple'
		);
		// NFD é → NFC é
		expect(normalizePassphraseInput('café')).toBe('café');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/passphrase.test.ts`
Expected: FAIL — `passphrase.ts` not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/crypto/passphrase.ts
/**
 * Site-generated claim passphrases — SPEC §4.2.4 (generated-only, 2026-07-12).
 * 4 EFF-large-wordlist words = 4 × log2(7776) ≈ 51.7 bits.
 */
import { EFF_WORDLIST } from './eff-wordlist';

const N = EFF_WORDLIST.length; // 7776
const LIMIT = Math.floor(65536 / N) * N; // 62208 — rejection bound for uniform draws

function drawIndex(): number {
	const buf = new Uint16Array(1);
	for (;;) {
		crypto.getRandomValues(buf);
		if (buf[0] < LIMIT) return buf[0] % N;
	}
}

/** 4 words, lowercase, single-space separated, NFC (already NFC: words are ASCII). */
export function generatePassphrase(): string {
	return Array.from({ length: 4 }, () => EFF_WORDLIST[drawIndex()]).join(' ');
}

/**
 * Claim-input normalization: case-insensitive, whitespace-collapsed, NFC.
 * The raw NFC-only form is the back-compat retry (pre-2026-07-12 human passphrases).
 */
export function normalizePassphraseInput(input: string): string {
	return input.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test -- tests/lib/passphrase.test.ts` → PASS. Then `npm run check` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto/eff-wordlist.ts src/lib/crypto/passphrase.ts tests/lib/passphrase.test.ts
git commit -m "feat: generated 4-word EFF passphrases (CSPRNG + rejection sampling)"
```

---

### Task 3: Three-segment fragment grammar

**Files:**
- Modify: `src/lib/gift-package.ts` (`parseShareCardFragment`, new `fragmentPassphrase`, new `claimLinkWithPassphrase`)
- Test: `tests/lib/gift-package.test.ts` (new)

**Interfaces:**
- Consumes: `bytesToB64url`, `b64urlToBytes` from `$lib/crypto/keys` (already imported in the file).
- Produces (Task 6, 7 rely on these exact signatures):
  - `parseShareCardFragment(fragment: string): Record<string, unknown>` — unchanged signature; now accepts `g1.<b64>` AND `g1.<b64>.<b64>` (returns the card either way); throws on 4+ segments, empty segments, or invalid base64url. `/recover` and the create round-trip self-check keep working unchanged because they call this.
  - `fragmentPassphrase(fragment: string): string | undefined` — decoded UTF-8 NFC passphrase from the third segment, `undefined` for two-segment fragments. Throws on malformed third segment (same corrupt-link semantics).
  - `claimLinkWithPassphrase(shareCard: Record<string, unknown>, origin: string, passphrase: string): string` — `${origin}/c#g1.<card_b64url>.<b64url(utf8(NFC(passphrase)))>`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/gift-package.test.ts
import { describe, it, expect } from 'vitest';
import {
	fullClaimLink,
	claimLinkWithPassphrase,
	parseShareCardFragment,
	fragmentPassphrase
} from '../../src/lib/gift-package';

const card = { script: { address: 'tb1p_test' }, claim: { secret_b64url: 'AAAA' } };
const frag = (link: string) => link.slice(link.indexOf('#') + 1);

describe('fragment grammar (SPEC §5.4)', () => {
	it('two-segment round-trip is unchanged', () => {
		const link = fullClaimLink(card, 'https://giftbitcoin.app');
		expect(frag(link).split('.').length).toBe(2);
		expect(parseShareCardFragment(frag(link))).toEqual(card);
		expect(fragmentPassphrase(frag(link))).toBeUndefined();
	});

	it('three-segment round-trips card AND passphrase; leading # accepted', () => {
		const link = claimLinkWithPassphrase(card, 'https://giftbitcoin.app', 'correct horse battery staple');
		const f = frag(link);
		expect(f.split('.').length).toBe(3);
		expect(parseShareCardFragment('#' + f)).toEqual(card);
		expect(fragmentPassphrase('#' + f)).toBe('correct horse battery staple');
	});

	it('passphrase is NFC-normalized on encode', () => {
		const link = claimLinkWithPassphrase(card, 'https://x', 'café a b c');
		expect(fragmentPassphrase(frag(link))).toBe('café a b c');
	});

	it('rejects malformed fragments', () => {
		const good = frag(claimLinkWithPassphrase(card, 'https://x', 'a b c d'));
		expect(() => parseShareCardFragment(good + '.extra')).toThrow(); // 4 segments
		expect(() => parseShareCardFragment('g1.')).toThrow(); // empty card
		expect(() => parseShareCardFragment('g1.abc!def')).toThrow(); // invalid b64url
		expect(() => fragmentPassphrase('g1.AAAA.')).toThrow(); // empty passphrase segment
		expect(() => fragmentPassphrase('g1.AAAA.!!')).toThrow(); // invalid b64url passphrase
		expect(() => parseShareCardFragment('v1.AAAA')).toThrow(); // not g1.
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/lib/gift-package.test.ts`
Expected: FAIL — `claimLinkWithPassphrase` / `fragmentPassphrase` not exported.

- [ ] **Step 3: Implement in `src/lib/gift-package.ts`**

Replace `parseShareCardFragment` and add the two functions (keep `fullClaimLink`, `isGiftFragment`, `CORRUPT_LINK_MSG` as-is):

```ts
/**
 * SPEC §5.4 fragment grammar: g1.<share_card_b64url> with an optional third
 * segment g1.<card>.<passphrase_b64url> (QR-only, self-sent opt-in gifts).
 * Dots don't occur in base64url, so splitting is unambiguous.
 */
function splitGiftFragment(fragment: string): { card: string; pass?: string } {
	const frag = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	if (!frag.startsWith('g1.')) throw new Error('not a full gift link');
	const segs = frag.slice('g1.'.length).split('.');
	if (segs.length > 2 || segs.some((s) => s.length === 0)) {
		throw new Error('malformed gift fragment');
	}
	return { card: segs[0], pass: segs[1] };
}

export function parseShareCardFragment(fragment: string): Record<string, unknown> {
	const bytes = b64urlToBytes(splitGiftFragment(fragment).card);
	return JSON.parse(new TextDecoder().decode(bytes));
}

/** Decoded passphrase from a three-segment fragment; undefined on two-segment links. */
export function fragmentPassphrase(fragment: string): string | undefined {
	const { pass } = splitGiftFragment(fragment);
	if (pass === undefined) return undefined;
	return new TextDecoder().decode(b64urlToBytes(pass)).normalize('NFC');
}

/**
 * Three-segment claim link — QR rendering for self-sent opt-in gifts ONLY.
 * Copy-link/share/email paths must keep using fullClaimLink (two-segment).
 */
export function claimLinkWithPassphrase(
	shareCard: Record<string, unknown>,
	origin: string,
	passphrase: string
): string {
	const pass = bytesToB64url(new TextEncoder().encode(passphrase.normalize('NFC')));
	return `${fullClaimLink(shareCard, origin)}.${pass}`;
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `npm test` → all pass (existing consumers unaffected: two-segment path identical). `npm run check` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gift-package.ts tests/lib/gift-package.test.ts
git commit -m "feat: three-segment claim fragment (QR passphrase embed) in shared parser"
```

---

### Task 4: Passphrase verify with normalization + retry-raw back-compat

**Files:**
- Modify: `src/lib/gift-package.ts` (add `verifyShareCardPassphrase`)
- Test: `tests/lib/gift-package.test.ts` (extend)

**Interfaces:**
- Consumes: `verifyShareCard` (same file), `normalizePassphraseInput` from `$lib/crypto/passphrase`.
- Produces (claim page Task 7 relies on this):
  - `verifyShareCardPassphrase(sc: Record<string, unknown>, rawInput: string): Promise<{ ok: boolean; passphrase: string; errors: string[] }>` — tries `normalizePassphraseInput(rawInput)` first; on failure retries once with `rawInput.normalize('NFC')` (skipped when identical to the normalized form). `passphrase` is the string that verified (or the normalized form on failure) — the caller derives the claim key with exactly this string.

- [ ] **Step 1: Write the failing tests** (append to `tests/lib/gift-package.test.ts`)

```ts
import { createGift } from '../../src/lib/crypto/create-gift';
import { buildPackages, verifyShareCardPassphrase } from '../../src/lib/gift-package';
import * as btc from '@scure/btc-signer';

describe('verifyShareCardPassphrase (back-compat retry)', () => {
	// Argon2id (64 MiB, t=3) runs twice here — slow test (~seconds), keep it single.
	it('normalized input claims a generated-words gift; raw-retry claims a legacy human-passphrase gift', async () => {
		// new-style gift: generated words (already normalized form)
		const g1 = await createGift({ policy: 'refund_self', passphrase: 'correct horse battery staple', network: btc.TEST_NETWORK });
		const sc1 = buildPackages(g1, { amountExpectedSats: 10_000 }).share_card;
		const r1 = await verifyShareCardPassphrase(sc1, '  Correct \t Horse battery STAPLE ');
		expect(r1.ok).toBe(true);
		expect(r1.passphrase).toBe('correct horse battery staple');

		// legacy gift: human-chosen passphrase with case/punctuation (pre-normalization era)
		const g2 = await createGift({ policy: 'refund_self', passphrase: 'Satoshi Nakamoto 2009!', network: btc.TEST_NETWORK });
		const sc2 = buildPackages(g2, { amountExpectedSats: 10_000 }).share_card;
		const r2 = await verifyShareCardPassphrase(sc2, 'Satoshi Nakamoto 2009!');
		expect(r2.ok).toBe(true);
		expect(r2.passphrase).toBe('Satoshi Nakamoto 2009!'); // raw retry won

		// wrong words fail cleanly
		const r3 = await verifyShareCardPassphrase(sc1, 'wrong words entirely here');
		expect(r3.ok).toBe(false);
	}, 120_000);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/lib/gift-package.test.ts` → FAIL (`verifyShareCardPassphrase` not exported).

- [ ] **Step 3: Implement** (in `src/lib/gift-package.ts`)

```ts
import { normalizePassphraseInput } from '$lib/crypto/passphrase';

/**
 * Claim-side passphrase check: normalized input first (case/whitespace/NFC),
 * then one retry with the raw NFC-only input — pre-2026-07-12 gifts carry
 * human-chosen passphrases derived NFC-only, and must stay claimable without
 * a version marker. Each attempt is a full Argon2id run by design.
 */
export async function verifyShareCardPassphrase(
	sc: Record<string, unknown>,
	rawInput: string
): Promise<{ ok: boolean; passphrase: string; errors: string[] }> {
	const normalized = normalizePassphraseInput(rawInput);
	const first = await verifyShareCard(sc, normalized);
	if (first.ok) return { ok: true, passphrase: normalized, errors: [] };
	const raw = rawInput.normalize('NFC');
	if (raw !== normalized) {
		const second = await verifyShareCard(sc, raw);
		if (second.ok) return { ok: true, passphrase: raw, errors: [] };
	}
	return { ok: false, passphrase: normalized, errors: first.errors };
}
```

- [ ] **Step 4: Run tests** → PASS; `npm run check` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gift-package.ts tests/lib/gift-package.test.ts
git commit -m "feat: claim passphrase normalization with raw-NFC back-compat retry"
```

---

### Task 5: Create flow — delivery choice + generated words

**Files:**
- Modify: `src/routes/create/+page.svelte`

**Interfaces:**
- Consumes: `generatePassphrase` from `$lib/crypto/passphrase`.
- Produces (Tasks 6 and 11 build on this exact state): `let delivery = $state<'self' | 'email'>('self')`, `let passOptIn = $state(false)`, `let words = $state('')`, `const passActive = $derived(delivery === 'email' || passOptIn)`. The passphrase passed to `createGift` and the round-trip self-check is `passActive ? words : undefined`.

No unit-test infra exists for Svelte components; verification is `npm run check` + `npm run build` + the existing suite.

- [ ] **Step 1: Replace passphrase state with delivery state**

In the `<script>` block, replace `let usePass = $state(false);` and `let passphrase = $state('');` with:

```ts
let delivery = $state<'self' | 'email'>('self');
let passOptIn = $state(false);
let words = $state('');
let wordsCopied = $state(false);
const passActive = $derived(delivery === 'email' || passOptIn);

function ensureWords() {
	if (!words) words = generatePassphrase();
}
async function copyWords() {
	try {
		await navigator.clipboard.writeText(words);
		wordsCopied = true;
		setTimeout(() => (wordsCopied = false), 1800);
	} catch {
		wordsCopied = false; // words are visible to select manually
	}
}
```

Add `import { generatePassphrase } from '$lib/crypto/passphrase';`.

In `continueToPay()` replace `const pass = usePass && passphrase ? passphrase : undefined;` with:

```ts
if (passActive) ensureWords();
const pass = passActive ? words : undefined;
```

(`giftKey` comparison logic is unchanged — it already keys on the passphrase string.)

- [ ] **Step 2: Delivery choice UI at step c1**

Replace the whole "Require a passphrase to redeem" `<div class="card">…</div>` inside the Advanced block with nothing (delete it), and insert a first-class block between the message `<textarea>` and the `adv-toggle` button:

```svelte
<div class="label-caps">How will you deliver it?</div>
<div class="deliver">
	<button class="opt" class:on={delivery === 'self'} onclick={() => (delivery = 'self')}>
		<div class="opt-title">I'll share it myself</div>
		<div class="opt-desc">Copy the link or QR code and send it any way you like.</div>
	</button>
	<button
		class="opt"
		class:on={delivery === 'email'}
		onclick={() => {
			delivery = 'email';
			ensureWords();
		}}
	>
		<div class="opt-title">Email it for them</div>
		<div class="opt-desc">We email the link — you send the 4 secret words separately.</div>
	</button>
</div>

{#if delivery === 'self'}
	<label class="pass-toggle">
		<input
			type="checkbox"
			bind:checked={passOptIn}
			class="checkbox"
			onchange={() => passOptIn && ensureWords()}
		/>
		<span class="pass-label">Add 4 secret words as a second lock (recommended if sharing over chat)</span>
	</label>
	{#if !passOptIn}
		<p class="deliver-note">
			Without the secret words, this gift can never be emailed for you later — that choice is locked
			in when you fund it.
		</p>
	{/if}
{:else}
	<p class="deliver-note">
		Email delivery locks in the 4 secret words below — the email alone can't claim the gift. If the
		email is lost, you can still share the link yourself, and you can reclaim the bitcoin after
		expiry.
	</p>
{/if}

{#if passActive && words}
	<div class="warn-box words-box">
		<div class="label-caps">The 4 secret words</div>
		<div class="words mono">{words}</div>
		<button class="btn-copy" onclick={copyWords}>{wordsCopied ? 'Copied ✓' : 'Copy words'}</button>
		<p class="deliver-note">
			Write these down — you'll give them to the recipient separately (text or tell them). They're
			never stored in your backup: lose them and the gift can't be redeemed, though you can reclaim
			after expiry.
		</p>
	</div>
{/if}
```

Add styles (in `<style>`):

```css
.deliver {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 12px;
}
.opt {
	text-align: left;
	background: #fff;
	border: 1px solid var(--border);
	border-radius: 14px;
	padding: 14px 16px;
	cursor: pointer;
}
.opt.on {
	border: 2px solid var(--amber);
}
.opt-title {
	font-size: 15px;
	font-weight: 600;
	margin-bottom: 2px;
}
.opt-desc {
	font-size: 13px;
	color: var(--muted);
}
.pass-label {
	font-size: 13.5px;
	font-weight: 600;
}
.deliver-note {
	font-size: 12.5px;
	color: var(--muted);
	line-height: 1.5;
	margin: 8px 0 0;
}
.words-box {
	margin: 12px 0 4px;
}
.words {
	font-size: 17px;
	font-weight: 700;
	letter-spacing: 0.02em;
	margin: 6px 0 10px;
	user-select: all;
}
```

(`.pass-toggle`/`.checkbox`/`.btn-copy` styles already exist — reuse.)

- [ ] **Step 3: Re-show the words on the share step (c4)**

In the `step === 'c4'` block, after the "This link is money" warn-box, add:

```svelte
{#if passActive && words}
	<div class="warn-box mtb words-box">
		<div class="label-caps">The 4 secret words</div>
		<div class="words mono">{words}</div>
		<button class="btn-copy" onclick={copyWords}>{wordsCopied ? 'Copied ✓' : 'Copy words'}</button>
		<p class="deliver-note">
			Now text or tell them these 4 words — the {delivery === 'email' ? 'email' : 'link'} alone
			can't claim the gift.
		</p>
	</div>
{/if}
```

- [ ] **Step 4: Verify**

Run: `npm run check` → clean; `npm test` → green; `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/create/+page.svelte
git commit -m "feat: delivery choice at create — generated 4-word passphrase, free-text input removed"
```

---

### Task 6: QR rendering (funding address + claim link)

**Files:**
- Create: `src/lib/components/Qr.svelte`
- Modify: `src/routes/create/+page.svelte` (pay-screen QR + share-step claim QR)
- Modify: `package.json` (dep)

**Interfaces:**
- Consumes: `claimLinkWithPassphrase` (Task 3), `passActive`/`words`/`delivery` state (Task 5).
- Produces: `<Qr data={string} label={string} />` component rendering an SVG QR (fixed white quiet-zone background — scannable on any theme).

- [ ] **Step 1: Add the dependency**

```bash
npm install qr
```

`qr` is paulmillr's zero-dependency QR encoder (same author as the repo's @noble/@scure stack). Verify the actual export shape in `node_modules/qr/README.md` before use — expected: `import encodeQR from 'qr'` with `encodeQR(text, 'svg', { ecc: 'medium', border: 2 })` returning an SVG string. Adapt the component if the API differs; do not swap libraries.

- [ ] **Step 2: Component**

```svelte
<!-- src/lib/components/Qr.svelte -->
<script lang="ts">
	import encodeQR from 'qr';

	let { data, label = '' }: { data: string; label?: string } = $props();
	// ecc 'low' keeps the module count down for ~1 KB three-segment payloads —
	// density is the scannability constraint, not damage tolerance, on a screen.
	const svg = $derived(encodeQR(data, 'svg', { ecc: 'low', border: 2 }));
</script>

<div class="qr-box" role="img" aria-label={label || 'QR code'}>
	{@html svg}
</div>

<style>
	.qr-box {
		background: #fff;
		border-radius: 10px;
		padding: 6px;
		line-height: 0;
	}
	.qr-box :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
```

Note: `{@html}` is safe here — input is our own generated SVG from our own data, no user HTML.

- [ ] **Step 3: Pay-screen funding QR**

In `create/+page.svelte` step c3, replace the placeholder `<div class="qr" aria-hidden="true">address<br />below</div>` with:

```svelte
<div class="qr">
	<Qr data={`bitcoin:${gift.payment.address}`} label="Gift address QR" />
</div>
```

Add `import Qr from '$lib/components/Qr.svelte';`. Update the `.qr` style: keep `flex: none; width: 104px;` and drop the `height`, striped `background`, and the centering/typography lines (the component brings its own box).

- [ ] **Step 4: Share-step claim QR**

In step c4, after the share-actions / words block, add:

```svelte
<div class="claim-qr">
	<Qr data={qrLink} label="Gift link QR" />
	<p class="deliver-note">
		{#if qrLink !== shareLink}
			This QR includes the secret words for a single-scan in-person handoff — show it only to the
			recipient. The copy/share link never includes them.
		{:else}
			Scanning opens the gift link directly.
		{/if}
	</p>
</div>
```

With the derived link (script block):

```ts
// Three-segment QR ONLY for self-sent passphrase-opt-in gifts (SPEC §5.4);
// email-delivery gifts and all copy/share paths stay two-segment.
const qrLink = $derived(
	packages && delivery === 'self' && passOptIn && words
		? claimLinkWithPassphrase(packages.share_card, window.location.origin, words)
		: shareLink
);
```

Add `claimLinkWithPassphrase` to the `$lib/gift-package` import. Style:

```css
.claim-qr {
	max-width: 240px;
	margin: 18px auto 0;
	text-align: center;
}
```

- [ ] **Step 5: Verify**

Run: `npm run check` && `npm test` && `npm run build` → all green. Note in the task report: three-segment QR density needs a manual real-phone scan check before shipping the variant (spec requirement — flag it, don't block).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/components/Qr.svelte src/routes/create/+page.svelte
git commit -m "feat: QR rendering — funding address + claim-link QR (3-segment for self opt-in)"
```

---

### Task 7: Claim page — normalized input, retry-raw, embedded passphrase

**Files:**
- Modify: `src/routes/c/+page.svelte`

**Interfaces:**
- Consumes: `verifyShareCardPassphrase`, `fragmentPassphrase` (Tasks 3–4), `claimPrivFromPassphrase` (existing).

- [ ] **Step 1: Wire the fragment passphrase**

In the imports, add `fragmentPassphrase` and `verifyShareCardPassphrase` to the `$lib/gift-package` import. Add state:

```ts
let embeddedPass = $state<string | null>(null);
let embeddedFailed = $state(false);
let passFails = $state(0);
```

In `openFragment(frag, …)`, after a successful `loadFromFragment(frag)`, read the third segment (throws are already handled by the corrupt-link path — but a malformed passphrase segment must not kill a loadable card, so guard it):

```ts
if (loadFromFragment(frag)) {
	try {
		embeddedPass = fragmentPassphrase(frag) ?? null;
	} catch {
		embeddedPass = null; // damaged third segment → fall back to manual prompt
	}
	screen = 'r0';
	checkChain();
	return;
}
```

(Note: `loadFromFragment` calls `parseShareCardFragment`, which throws on a malformed third segment — the corrupt-link message then applies to the whole link. The guard above covers the case where the card segment parses but the passphrase segment is empty/invalid: `splitGiftFragment` rejects empty segments, so reaching it means both parsed; the try/catch is belt-and-braces for the decode.)

- [ ] **Step 2: Skip the prompt when an embedded passphrase exists**

In screen r2, change the passphrase block:

```svelte
{#if g?.passphraseRequired && (!embeddedPass || embeddedFailed)}
	<div class="label-caps">The 4 secret words</div>
	{#if embeddedFailed}
		<p class="err">
			The scanned code's built-in words didn't match this gift — enter the 4 words from the sender.
		</p>
	{/if}
	<input bind:value={passphrase} placeholder="Enter the 4 secret words from the sender." class="mb" />
{/if}
```

(Also drop `type="password"` — 4 dictionary words benefit from visibility; typos are the failure mode, shoulder-surfing of a generated phrase is not.)

In `submitAddr()`, the guard becomes:

```ts
if (g?.passphraseRequired && !passphrase && !(embeddedPass && !embeddedFailed)) {
	addrError = 'This gift needs its 4 secret words — enter them above to continue.';
	return;
}
```

- [ ] **Step 3: Normalization + retry-raw + embedded fallback in `prepareClaim`**

Replace the derivation/verify section of `prepareClaim()` (the `deriveClaimPriv()` + `verifyShareCard` calls) with input-resolution that (a) prefers the embedded passphrase, (b) uses the normalize-then-raw retry, (c) falls back to the manual prompt when the embedded passphrase fails — never a dead-end:

```ts
async function prepareClaim() {
	if (!g) return;
	const gen = ++claimGen;
	preparing = true;
	prepError = '';
	prep = null;
	claimPriv = null;
	amountsChanged = false;
	try {
		let priv: Uint8Array;
		if (g.passphraseRequired) {
			const usingEmbedded = !!embeddedPass && !embeddedFailed;
			const input = usingEmbedded ? embeddedPass! : passphrase;
			const check = await verifyShareCardPassphrase(g.sc, input);
			if (gen !== claimGen) return;
			if (!check.ok) {
				if (usingEmbedded) {
					// QR-embedded words don't derive the committed key — fall back to
					// the manual prompt (SPEC §5.4: never dead-end in a wrong-key error).
					embeddedFailed = true;
					screen = 'r2';
					return;
				}
				passFails += 1;
				prepError =
					passFails >= 3
						? "Those words still don't match. Check the words with the sender — the gift can't open without the exact 4."
						: "Those words don't match this gift. Check them and try again.";
				return;
			}
			passFails = 0;
			priv = await claimPrivFromPassphrase(g.secret, check.passphrase);
		} else {
			const check = await verifyShareCard(g.sc);
			if (gen !== claimGen) return;
			if (!check.ok) {
				prepError = 'This gift link looks corrupted (' + check.errors[0] + ').';
				return;
			}
			priv = claimPrivFromSecret(g.secret);
		}
		if (gen !== claimGen) return;
		const C = xOnlyFromPriv(priv);
		const utxos = await getUtxos(g.address);
		// … rest of the function unchanged (funded check, feeRate, buildClaimTx) …
```

Delete the now-unused `deriveClaimPriv()` helper. Keep everything from `const utxos = await getUtxos(g.address);` down identical (including the `claimPriv = priv;` assignment at the end).

Note the double-Argon2id cost: `verifyShareCardPassphrase` already derived internally, then `claimPrivFromPassphrase` re-derives. Acceptable (matches the existing verify-then-derive shape); if you want to avoid it, don't — keeping `verifyShareCard` as the single integrity gate is worth one extra KDF run. `// ponytail: 2× Argon2id per successful prepare; plumb the priv out of verify if it ever hurts`.

- [ ] **Step 4: Verify**

Run: `npm run check` && `npm test` && `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/c/+page.svelte
git commit -m "feat: claim passphrase UX — normalization, raw retry, QR-embedded words with fallback"
```

---

### Task 8: Worker — scaffold + request validation + address recompute

**Files:**
- Create: `worker/wrangler.jsonc`
- Create: `worker/src/types.ts`
- Create: `worker/src/send.ts`
- Test: `tests/worker/send.test.ts` (new; picked up by the existing vitest `tests/**` include)

**Interfaces:**
- Consumes: `buildGiftPayment` from `../../src/lib/crypto/gift-script`, `hexToBytesStrict`, `b64urlToBytes` from `../../src/lib/crypto/keys`, `btc.TEST_NETWORK` from `@scure/btc-signer` (all relative imports — these modules use only relative paths internally, no `$lib` aliases).
- Produces (Tasks 9–10 extend the same file):
  - `interface SendEnv` (types.ts): `{ EMAIL: { send(msg: EmailSendParams): Promise<{ messageId?: string }> }; IP_LIMIT: RateLimit; ADDR_LIMIT: RateLimit; TURNSTILE_SECRET: string; ALLOWED_ORIGIN: string; FROM_EMAIL: string; ESPLORA_BASE: string }` with `interface RateLimit { limit(opts: { key: string }): Promise<{ success: boolean }> }`.
  - `validateSend(body: unknown, env: SendEnv): { to: string; link: string; fromName: string; message: string; address: string } | { error: string; status: number }` — pure, synchronous, fully unit-testable.
  - `handleSend(request: Request, env: SendEnv): Promise<Response>` — completed across Tasks 9–10.

- [ ] **Step 1: wrangler.jsonc**

```jsonc
// worker/wrangler.jsonc — the /api/send email relay (design doc 2026-07-12).
// Deploy: npx wrangler deploy -c worker/wrangler.jsonc
// Secrets: npx wrangler secret put TURNSTILE_SECRET -c worker/wrangler.jsonc
{
	"name": "giftbitcoin-send",
	"main": "src/index.ts",
	"compatibility_date": "2026-07-01",
	"routes": [{ "pattern": "giftbitcoin.app/api/send", "zone_name": "giftbitcoin.app" }],
	"send_email": [{ "name": "EMAIL" }],
	"vars": {
		"ALLOWED_ORIGIN": "https://giftbitcoin.app",
		"FROM_EMAIL": "gifts@giftbitcoin.app",
		"ESPLORA_BASE": "https://mempool.space/testnet4/api"
	},
	"unsafe": {
		"bindings": [
			{ "type": "ratelimit", "name": "IP_LIMIT", "namespace_id": "1001", "simple": { "limit": 6, "period": 60 } },
			{ "type": "ratelimit", "name": "ADDR_LIMIT", "namespace_id": "1002", "simple": { "limit": 3, "period": 60 } }
		]
	}
}
```

- [ ] **Step 2: types.ts** — hand-written minimal binding types (no `@cloudflare/workers-types` dep; keeps the repo's DOM-lib tsconfig untouched):

```ts
// worker/src/types.ts — minimal shapes for the bindings /api/send uses.
export interface RateLimit {
	limit(opts: { key: string }): Promise<{ success: boolean }>;
}
export interface EmailSendParams {
	to: string;
	from: { email: string; name: string };
	subject: string;
	html: string;
	text: string;
}
export interface SendEnv {
	EMAIL: { send(msg: EmailSendParams): Promise<{ messageId?: string }> };
	IP_LIMIT: RateLimit;
	ADDR_LIMIT: RateLimit;
	/** Turnstile secret — wrangler secret, never in vars */
	TURNSTILE_SECRET: string;
	ALLOWED_ORIGIN: string;
	FROM_EMAIL: string;
	ESPLORA_BASE: string;
}
```

- [ ] **Step 3: Failing tests for validation**

```ts
// tests/worker/send.test.ts
import { describe, it, expect } from 'vitest';
import * as btc from '@scure/btc-signer';
import { createGift } from '../../src/lib/crypto/create-gift';
import { buildPackages, fullClaimLink, claimLinkWithPassphrase } from '../../src/lib/gift-package';
import { validateSend } from '../../worker/src/send';
import type { SendEnv } from '../../worker/src/types';

const env = {
	ALLOWED_ORIGIN: 'https://giftbitcoin.app',
	FROM_EMAIL: 'gifts@giftbitcoin.app',
	ESPLORA_BASE: 'https://esplora.test'
} as SendEnv;

async function passGift() {
	const g = await createGift({ policy: 'refund_self', passphrase: 'a b c d', network: btc.TEST_NETWORK });
	const packages = buildPackages(g, { amountExpectedSats: 10_000 });
	return { g, sc: packages.share_card, link: fullClaimLink(packages.share_card, env.ALLOWED_ORIGIN) };
}

describe('validateSend', () => {
	it('accepts a valid passphrase-committed link and returns the recomputed address', async () => {
		const { g, link } = await passGift();
		const r = validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env);
		expect('error' in r).toBe(false);
		if (!('error' in r)) expect(r.address).toBe(g.payment.address);
	}, 30_000);

	it('rejects: non-object, missing fields, bad email, oversize fields', async () => {
		const { link } = await passGift();
		for (const body of [
			null,
			'str',
			{},
			{ to: 'a@b.co', link },                                        // no turnstile_token
			{ to: 'not-an-email', link, turnstile_token: 't' },
			{ to: 'a@b.co', link, turnstile_token: 't', from_name: 'x'.repeat(65) },
			{ to: 'a@b.co', link, turnstile_token: 't', message: 'x'.repeat(281) }
		]) {
			const r = validateSend(body, env);
			expect('error' in r && r.status === 400).toBe(true);
		}
	}, 30_000);

	it('rejects wrong origin and non-g1 grammar', async () => {
		const { link } = await passGift();
		const evil = link.replace('https://giftbitcoin.app', 'https://evil.example');
		expect(validateSend({ to: 'a@b.co', link: evil, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
		expect(validateSend({ to: 'a@b.co', link: 'https://giftbitcoin.app/c#v1.AAAA', turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);

	it('rejects three-segment links outright', async () => {
		const { sc } = await passGift();
		const three = claimLinkWithPassphrase(sc, env.ALLOWED_ORIGIN, 'a b c d');
		expect(validateSend({ to: 'a@b.co', link: three, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);

	it('rejects passphrase_required !== true', async () => {
		const g = await createGift({ policy: 'refund_self', network: btc.TEST_NETWORK }); // no passphrase
		const link = fullClaimLink(buildPackages(g, { amountExpectedSats: 10_000 }).share_card, env.ALLOWED_ORIGIN);
		expect(validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	});

	it('rejects a card whose address does not recompute from its script fields', async () => {
		const { g, sc } = await passGift();
		const forged = structuredClone(sc) as any;
		// address copied off a block explorer — script fields don't derive it
		forged.script.address = 'tb1puardpztfpeqnvxvz2m2mgficm7u6za9lyv6rzn9y7lqe66ye0lfq3hu3rw';
		const link = fullClaimLink(forged, env.ALLOWED_ORIGIN);
		const r = validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env);
		expect(r).toMatchObject({ status: 400 });
		// and the honest card still passes
		const ok = validateSend({ to: 'a@b.co', link: fullClaimLink(sc, env.ALLOWED_ORIGIN), turnstile_token: 't' }, env);
		expect('error' in ok).toBe(false);
		if (!('error' in ok)) expect(ok.address).toBe(g.payment.address);
	}, 30_000);

	it('rejects non-testnet4 cards', async () => {
		const { sc } = await passGift();
		const alt = structuredClone(sc) as any;
		alt.network = 'mainnet';
		expect(validateSend({ to: 'a@b.co', link: fullClaimLink(alt, env.ALLOWED_ORIGIN), turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);
});
```

- [ ] **Step 4: Run to verify failure** — `npm test -- tests/worker/send.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `worker/src/send.ts` (validation half)**

```ts
/**
 * POST /api/send — send-and-forget email relay for passphrase-committed gifts.
 * Design: docs/superpowers/specs/2026-07-12-send-mechanism-design.md.
 * SPEC §5.1 carve-out: the share_card transits, is never persisted, never logged.
 */
import * as btc from '@scure/btc-signer';
import { buildGiftPayment } from '../../src/lib/crypto/gift-script';
import { hexToBytesStrict, b64urlToBytes } from '../../src/lib/crypto/keys';
import type { SendEnv } from './types';

const B64URL = /^[A-Za-z0-9_-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidSend {
	to: string;
	link: string;
	fromName: string;
	message: string;
	address: string;
}
export type SendError = { error: string; status: number };

const bad = (error: string): SendError => ({ error, status: 400 });

export function validateSend(body: unknown, env: SendEnv): ValidSend | SendError {
	if (typeof body !== 'object' || body === null) return bad('bad_request');
	const b = body as Record<string, unknown>;
	const to = typeof b.to === 'string' ? b.to.trim() : '';
	const link = typeof b.link === 'string' ? b.link : '';
	const fromName = typeof b.from_name === 'string' ? b.from_name.trim() : '';
	const message = typeof b.message === 'string' ? b.message.trim() : '';
	if (typeof b.turnstile_token !== 'string' || !b.turnstile_token) return bad('turnstile_required');
	if (!EMAIL_RE.test(to) || to.length > 254) return bad('bad_email');
	if (fromName.length > 64 || /[\r\n]/.test(fromName)) return bad('bad_from_name');
	if (message.length > 280) return bad('bad_message');

	// Link: our origin, g1. grammar, exactly two segments (passphrase segment rejected).
	const prefix = `${env.ALLOWED_ORIGIN}/c#g1.`;
	if (!link.startsWith(prefix) || link.length > 8192) return bad('bad_link');
	const payload = link.slice(prefix.length);
	if (!B64URL.test(payload)) return bad('bad_link'); // a '.' (3-segment) fails this too

	let card: Record<string, unknown>;
	try {
		card = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
	} catch {
		return bad('bad_link');
	}
	if (card.network !== 'testnet4') return bad('bad_network');
	const claim = (card.claim ?? {}) as Record<string, unknown>;
	// UX guard on the honest path, not an abuse control — a forged card can set it.
	if (claim.passphrase_required !== true) return bad('passphrase_required');

	// Recompute the taproot address from the card's script fields — without this,
	// any funded address copied off a block explorer would pass the funding check.
	const script = (card.script ?? {}) as Record<string, unknown>;
	try {
		const payment = buildGiftPayment({
			C: hexToBytesStrict(String(script.C_xonly), 32),
			R: hexToBytesStrict(String(script.R_xonly), 32),
			T: Number(script.T),
			network: btc.TEST_NETWORK
		});
		if (payment.address !== script.address) return bad('address_mismatch');
		if (payment.nums_xonly !== script.nums_xonly) return bad('address_mismatch');
		return { to, link, fromName, message, address: payment.address };
	} catch {
		return bad('bad_card');
	}
}
```

- [ ] **Step 6: Run tests** — `npm test -- tests/worker/send.test.ts` → PASS. `npm run check` → clean (svelte-check covers only `src/`; vitest compiles the worker files — that's the type gate here).

- [ ] **Step 7: Commit**

```bash
git add worker/ tests/worker/send.test.ts
git commit -m "feat: /api/send worker — request validation + taproot address recompute"
```

---

### Task 9: Worker — Turnstile, rate limits, esplora fail-closed gates

**Files:**
- Modify: `worker/src/send.ts`
- Test: `tests/worker/send.test.ts` (extend)

**Interfaces:**
- Produces (Task 10 wires these into the handler):
  - `verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean>` — POST `https://challenges.cloudflare.com/turnstile/v0/siteverify` (form-encoded `secret`, `response`, `remoteip`), returns `outcome.success === true`; any fetch error → `false`.
  - `checkFunded(address: string, env: SendEnv): Promise<boolean>` — esplora `GET {ESPLORA_BASE}/address/{addr}/utxo` with `AbortSignal.timeout(5000)`; **throws** on network error/timeout/non-OK (caller fails closed with 502); returns whether any UTXO has `status.confirmed`. Uses `caches.default` keyed on the esplora URL with `Cache-Control: max-age=60` when available (absent in node tests → plain fetch).
  - `sha256Hex(s: string): Promise<string>` — WebCrypto digest for the per-address rate-limit key.

- [ ] **Step 1: Failing tests** (append to `tests/worker/send.test.ts`)

```ts
import { vi, afterEach } from 'vitest';
import { verifyTurnstile, checkFunded, sha256Hex } from '../../worker/src/send';
import { stubFetch } from '../lib/helpers';

describe('worker gates', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('verifyTurnstile: success, failure, and fetch-error → false', async () => {
		stubFetch({ '/siteverify': () => new Response(JSON.stringify({ success: true })) });
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(true);
		stubFetch({ '/siteverify': () => new Response(JSON.stringify({ success: false })) });
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(false);
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(false);
	});

	it('checkFunded: confirmed / unconfirmed / empty', async () => {
		const env = { ESPLORA_BASE: 'https://esplora.test' } as any;
		stubFetch({ '/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }])) });
		expect(await checkFunded('tb1qaddr', env)).toBe(true);
		stubFetch({ '/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: false } }])) });
		expect(await checkFunded('tb1qaddr', env)).toBe(false);
		stubFetch({ '/utxo': () => new Response('[]') });
		expect(await checkFunded('tb1qaddr', env)).toBe(false);
	});

	it('checkFunded THROWS on esplora failure (fail closed — caller must not email)', async () => {
		const env = { ESPLORA_BASE: 'https://esplora.test' } as any;
		stubFetch({ '/utxo': () => new Response('down', { status: 503 }) });
		await expect(checkFunded('tb1qaddr', env)).rejects.toThrow();
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
		await expect(checkFunded('tb1qaddr', env)).rejects.toThrow();
	});

	it('sha256Hex is stable', async () => {
		expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (exports missing).

- [ ] **Step 3: Implement** (append to `worker/src/send.ts`)

```ts
/** Turnstile siteverify — required gate; any error counts as failure. */
export async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
	try {
		const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ secret, response: token, remoteip: ip })
		});
		if (!r.ok) return false;
		const outcome = (await r.json()) as { success?: boolean };
		return outcome.success === true;
	} catch {
		return false;
	}
}

/**
 * Server-side funding check: ≥1 confirmed UTXO. Hard 5 s timeout; THROWS on any
 * esplora failure so the caller fails closed (no email). 60 s Cache API layer
 * (public chain data keyed on the esplora URL — no link material) absorbs
 * duplicate taps; absent outside Workers (node tests) → plain fetch.
 */
export async function checkFunded(address: string, env: SendEnv): Promise<boolean> {
	const url = `${env.ESPLORA_BASE}/address/${encodeURIComponent(address)}/utxo`;
	const cache = (globalThis as { caches?: { default: Cache } }).caches?.default;
	let res = await cache?.match(url);
	if (!res) {
		res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) throw new Error(`esplora ${res.status}`);
		if (cache) {
			const copy = new Response(res.clone().body, res);
			copy.headers.set('Cache-Control', 'max-age=60');
			await cache.put(url, copy);
		}
	}
	const utxos = (await res.json()) as Array<{ status?: { confirmed?: boolean } }>;
	return utxos.some((u) => u.status?.confirmed === true);
}

/** Rate-limit key for the gift address — the counter never sees the link. */
export async function sha256Hex(s: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/send.ts tests/worker/send.test.ts
git commit -m "feat: /api/send gates — turnstile verify, esplora fail-closed + cache, addr hash"
```

---

### Task 10: Worker — email template + full handler + entry

**Files:**
- Modify: `worker/src/send.ts` (`renderEmail`, `handleSend`)
- Create: `worker/src/index.ts`
- Test: `tests/worker/send.test.ts` (extend)

**Interfaces:**
- Produces:
  - `renderEmail(link: string, fromName: string, message: string): { subject: string; html: string; text: string }` — fixed template; `fromName`/`message` HTML-escaped; the claim link is the only URL; never a passphrase (the server never has one).
  - `handleSend(request: Request, env: SendEnv): Promise<Response>` — full pipeline. JSON responses `{ ok: true }` / `{ ok: false, error }`; statuses: 405 non-POST, 400 validation, 429 rate limit, 403 turnstile, 502 esplora/email failure ("failed closed"), 200 success.
  - `worker/src/index.ts`: `export default { async fetch(request, env) { return handleSend(request, env); } }`.

- [ ] **Step 1: Failing tests** (append)

```ts
import { renderEmail, handleSend } from '../../worker/src/send';

function mockEnv(overrides: Partial<Record<string, unknown>> = {}) {
	const sent: any[] = [];
	const env = {
		EMAIL: { send: vi.fn(async (m: any) => { sent.push(m); return { messageId: 'id' }; }) },
		IP_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
		ADDR_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
		TURNSTILE_SECRET: 'sec',
		ALLOWED_ORIGIN: 'https://giftbitcoin.app',
		FROM_EMAIL: 'gifts@giftbitcoin.app',
		ESPLORA_BASE: 'https://esplora.test',
		...overrides
	};
	return { env: env as any, sent };
}
const post = (body: unknown) =>
	new Request('https://giftbitcoin.app/api/send', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
		body: JSON.stringify(body)
	});

describe('renderEmail', () => {
	it('escapes HTML in from_name/message; link is present; template is fixed', () => {
		const { subject, html, text } = renderEmail(
			'https://giftbitcoin.app/c#g1.AAAA',
			'<b>Eve</b>',
			'Hi <script>alert(1)</script>'
		);
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
		expect(html).toContain('https://giftbitcoin.app/c#g1.AAAA');
		expect(text).toContain('https://giftbitcoin.app/c#g1.AAAA');
		expect(subject).toContain('Bitcoin gift');
		expect(html).toContain('4 secret words');
	});
});

describe('handleSend', () => {
	afterEach(() => vi.unstubAllGlobals());

	async function fundedSetup() {
		const { g, link } = await passGift();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }]))
		});
		return { g, link };
	}

	it('happy path: 200, one email sent to recipient with the link', async () => {
		const { link } = await fundedSetup();
		const { env, sent } = mockEnv();
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't', from_name: 'Al', message: 'hi' }), env);
		expect(res.status).toBe(200);
		expect(sent.length).toBe(1);
		expect(sent[0].to).toBe('r@x.co');
		expect(sent[0].html).toContain(link);
		expect(sent[0].from.email).toBe('gifts@giftbitcoin.app');
	}, 30_000);

	it('405 non-POST; 400 bad JSON', async () => {
		const { env } = mockEnv();
		expect((await handleSend(new Request('https://x/api/send'), env)).status).toBe(405);
		const badJson = new Request('https://x/api/send', { method: 'POST', body: '{nope' });
		expect((await handleSend(badJson, env)).status).toBe(400);
	});

	it('429 when IP or address limiter says no — before any esplora/turnstile call', async () => {
		const { link } = await fundedSetup();
		const { env, sent } = mockEnv({ IP_LIMIT: { limit: async () => ({ success: false }) } });
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env);
		expect(res.status).toBe(429);
		expect(sent.length).toBe(0);
		const { env: env2 } = mockEnv({ ADDR_LIMIT: { limit: async () => ({ success: false }) } });
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env2)).status).toBe(429);
	}, 30_000);

	it('403 on turnstile failure; no email', async () => {
		const { link } = await passGift();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: false })),
			'/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }]))
		});
		const { env, sent } = mockEnv();
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(403);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('400 unfunded; 502 esplora down (fail closed) — no email either way', async () => {
		const { link } = await passGift();
		const { env, sent } = mockEnv();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response('[]')
		});
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(400);
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response('down', { status: 503 })
		});
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(502);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('502 when EMAIL.send throws', async () => {
		const { link } = await fundedSetup();
		const { env } = mockEnv({ EMAIL: { send: async () => { throw Object.assign(new Error('x'), { code: 'E_DELIVERY_FAILED' }); } } });
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(502);
	}, 30_000);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** (append to `worker/src/send.ts`)

```ts
const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Fixed branded template. The claim link is the only link; never a passphrase. */
export function renderEmail(link: string, fromName: string, message: string) {
	const who = fromName ? `${esc(fromName)} sent` : 'Someone sent';
	const note = message
		? `<p style="margin:16px 0;padding:12px 16px;background:#f7f2e7;border-radius:10px;color:#4a4436;">${esc(message).replace(/\n/g, '<br>')}</p>`
		: '';
	const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2b2620;">
<h1 style="font-size:22px;">${who} you a Bitcoin gift 🎁</h1>
${note}
<p><a href="${link}" style="display:inline-block;background:#c97210;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">Open your gift</a></p>
<p style="font-size:14px;color:#6b6355;">The sender will give you <strong>4 secret words</strong> to open it — this email alone can't claim the gift.</p>
<p style="font-size:12px;color:#9a8e71;">Bitcoin testnet4 — no real value. If the button doesn't work, copy this link:<br>${link}</p>
</div>`;
	const text = `${who.replace(/<[^>]*>/g, '')} you a Bitcoin gift.
${message ? '\n"' + message + '"\n' : ''}
Open it: ${link}

The sender will give you 4 secret words to open it — this email alone can't claim the gift.
(Bitcoin testnet4 — no real value.)`;
	return { subject: `${fromName ? esc(fromName) + ' sent' : 'Someone sent'} you a Bitcoin gift`, html, text };
}

const json = (status: number, body: Record<string, unknown>) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, error: string) => json(status, { ok: false, error });

/** The full pipeline. Send-and-forget: nothing persistent, no logging of the body. */
export async function handleSend(request: Request, env: SendEnv): Promise<Response> {
	if (request.method !== 'POST') return fail(405, 'method');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return fail(400, 'bad_json');
	}
	// Cheap gate first: per-IP counter (CF-Connecting-IP is set by Cloudflare itself).
	const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
	if (!(await env.IP_LIMIT.limit({ key: ip })).success) return fail(429, 'rate_limited');

	const v = validateSend(body, env);
	if ('error' in v) return fail(v.status, v.error);

	if (!(await env.ADDR_LIMIT.limit({ key: await sha256Hex(v.address) })).success) {
		return fail(429, 'rate_limited');
	}
	if (!(await verifyTurnstile((body as Record<string, unknown>).turnstile_token as string, ip, env.TURNSTILE_SECRET))) {
		return fail(403, 'turnstile_failed');
	}
	// Funding check LAST among gates: fails closed on esplora trouble.
	let funded: boolean;
	try {
		funded = await checkFunded(v.address, env);
	} catch {
		return fail(502, 'chain_unavailable');
	}
	if (!funded) return fail(400, 'not_funded');

	const { subject, html, text } = renderEmail(v.link, v.fromName, v.message);
	try {
		await env.EMAIL.send({
			to: v.to,
			from: { email: env.FROM_EMAIL, name: 'GiftBitcoin' },
			subject,
			html,
			text
		});
	} catch {
		return fail(502, 'send_failed');
	}
	return json(200, { ok: true });
}
```

And the entry:

```ts
// worker/src/index.ts
import { handleSend } from './send';
import type { SendEnv } from './types';

export default {
	async fetch(request: Request, env: SendEnv): Promise<Response> {
		return handleSend(request, env);
	}
};
```

- [ ] **Step 4: Run the full suite** — `npm test` → all green.

- [ ] **Step 5: Bundle sanity** — verify the worker builds (hash-wasm reaches the graph via `keys.ts` but is tree-shaken; confirm):

```bash
npx wrangler deploy --dry-run --outdir /tmp/worker-dry -c worker/wrangler.jsonc
```

Expected: bundle produced without error. (wrangler may need `npx` to fetch; if the unsafe ratelimit binding blocks a dry run, note it in the report — do not restructure.) If `wrangler` is unavailable offline, note it and move on; tests are the gate.

- [ ] **Step 6: Commit**

```bash
git add worker/ tests/worker/send.test.ts
git commit -m "feat: /api/send — sanitized email template, full gated handler, worker entry"
```

---

### Task 11: Client send form + share tier + Turnstile + CSP

**Files:**
- Create: `src/config/send.ts`
- Modify: `src/routes/create/+page.svelte` (share tier + email form on c4)
- Modify: `svelte.config.js` (CSP)

**Interfaces:**
- Consumes: Task 5 state (`delivery`, `words`), `shareLink` (existing), `/api/send` contract (Task 10): POST JSON `{ to, link, from_name?, message?, turnstile_token }` → `{ ok }` / `{ ok:false, error }`.

- [ ] **Step 1: Config**

```ts
// src/config/send.ts
/** Turnstile site key — dummy "always passes" key for dev; set the real widget key at deploy. */
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
export const SEND_API_PATH = '/api/send';
```

- [ ] **Step 2: CSP** — in `svelte.config.js` directives:

```js
'script-src': ['self', 'wasm-unsafe-eval', 'https://challenges.cloudflare.com'],
// …
'frame-src': ['https://challenges.cloudflare.com'],
```

(Add the new `frame-src` key; leave every other directive untouched. Comment: `// Turnstile widget (send form) — SPEC §13.`)

- [ ] **Step 3: Share tier + email form on c4** (in `create/+page.svelte`)

Script additions:

```ts
import { TURNSTILE_SITE_KEY, SEND_API_PATH } from '$config/send';

let canWebShare = $state(false); // set in onMount: browser-only API
let toEmail = $state('');
let sendState = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
let sendError = $state('');
let turnstileToken = $state('');
let turnstileWidget: string | undefined;

// in onMount (alongside the price fetch):
canWebShare = navigator.canShare?.({ url: location.href }) ?? !!navigator.share;

async function webShare() {
	try {
		await navigator.share({ url: shareLink });
	} catch {
		/* user cancel / unsupported — the copy button is right there (silent fallback) */
	}
}

/** Svelte action: explicit Turnstile render (widget div mounts long after page load). */
function turnstile(el: HTMLElement) {
	const render = () => {
		turnstileWidget = (window as any).turnstile.render(el, {
			sitekey: TURNSTILE_SITE_KEY,
			action: 'send-email',
			callback: (t: string) => (turnstileToken = t),
			'expired-callback': () => (turnstileToken = '')
		});
	};
	if ((window as any).turnstile) render();
	else {
		(window as any).__gbTurnstileOnload = render;
		const s = document.createElement('script');
		s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__gbTurnstileOnload&render=explicit';
		s.async = true;
		s.defer = true;
		document.head.appendChild(s);
	}
}

async function sendGiftEmail() {
	sendError = '';
	const to = toEmail.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
		sendError = 'Enter the recipient’s email address.';
		return;
	}
	if (!turnstileToken) {
		sendError = 'Please complete the human check first.';
		return;
	}
	sendState = 'sending';
	try {
		const res = await fetch(SEND_API_PATH, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				to,
				link: shareLink, // ALWAYS the two-segment link — never qrLink
				from_name: fromName.trim() || undefined,
				message: message.trim() || undefined,
				turnstile_token: turnstileToken
			})
		});
		if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
		sendState = 'sent';
	} catch {
		sendState = 'error';
		sendError = "The email couldn't be sent right now — copy the link and send it yourself instead.";
	} finally {
		// Turnstile tokens are single-use: siteverify consumed it either way.
		turnstileToken = '';
		(window as any).turnstile?.reset?.(turnstileWidget);
	}
}
```

Markup on c4 — email-delivery gifts get the form as the primary action, above the share buttons; the words re-show block (Task 5 step 3) becomes the "sent" confirmation anchor:

```svelte
{#if delivery === 'email'}
	<div class="card email-card">
		{#if sendState === 'sent'}
			<div class="success-check small">✓</div>
			<p class="lede">
				Handed to the mail system — confirm it arrived when you send them the 4 words.
			</p>
			<p class="deliver-note">
				Now text or tell them these 4 words — the email alone can't claim the gift.
			</p>
			<div class="words mono">{words}</div>
		{:else}
			<div class="label-caps">Email it for them</div>
			<input bind:value={toEmail} type="email" placeholder="recipient@example.com" />
			<div use:turnstile class="turnstile-slot"></div>
			{#if sendError}<p class="error">{sendError}</p>{/if}
			<button class="btn btn-primary" disabled={sendState === 'sending'} onclick={sendGiftEmail}>
				{sendState === 'sending' ? 'Sending…' : 'Send the gift email'}
			</button>
			<p class="deliver-note">
				We email only the link. You send the 4 secret words yourself — text or tell them.
			</p>
		{/if}
	</div>
{/if}

<div class="share-actions">
	{#if canWebShare}
		<button class="btn btn-primary" onclick={webShare}>Share…</button>
	{/if}
	<button class={canWebShare ? 'btn btn-secondary' : 'btn btn-primary'} onclick={copyLink}>
		{linkCopied ? 'Link copied ✓' : 'Copy gift link'}
	</button>
	<div class="msg-links">
		<a href={`https://wa.me/?text=${encodeURIComponent(shareLink)}`} target="_blank" rel="noreferrer">WhatsApp</a>
		<span>·</span>
		<a href={`sms:?&body=${encodeURIComponent(shareLink)}`}>Messages</a>
	</div>
	<button class="btn btn-secondary" onclick={downloadBackup}>
		{backedUp ? 'Backup downloaded ✓' : 'Download backup'}
	</button>
</div>
```

(This replaces the existing `share-actions` div; keep the copy-fallback + more-dl blocks below it.) Styles:

```css
.email-card {
	padding: 18px;
	margin: 0 0 16px;
}
.email-card input {
	margin: 10px 0;
}
.turnstile-slot {
	min-height: 65px;
	margin-bottom: 10px;
}
.msg-links {
	display: flex;
	gap: 8px;
	justify-content: center;
	font-size: 13.5px;
	font-weight: 600;
}
.success-check.small {
	font-size: 28px;
}
```

- [ ] **Step 4: Verify**

Run: `npm run check` && `npm test` && `npm run build` → green. Grep the built output to confirm the CSP meta/headers include `challenges.cloudflare.com` (`grep -r "challenges.cloudflare.com" build/ | head -3`).

- [ ] **Step 5: Commit**

```bash
git add src/config/send.ts src/routes/create/+page.svelte svelte.config.js
git commit -m "feat: share tier (Web Share/WhatsApp/SMS) + email send form with Turnstile; CSP entry"
```

---

### Task 12: Docs — deployment runbook + TODO

**Files:**
- Modify: `docs/DEPLOY.md`
- Modify: `TODO.md`

- [ ] **Step 1: DEPLOY.md** — add a "Send relay Worker (/api/send)" section:

```markdown
## Send relay Worker (/api/send)

The email relay is a Cloudflare Worker (`worker/`) on the giftbitcoin.app zone — the static
origin is untouched. One-time setup, in order:

1. **Email Sending onboarding:** `npx wrangler email sending enable giftbitcoin.app`
   (adds DKIM/SPF records; the Worker sends from `gifts@giftbitcoin.app`).
2. **Turnstile widget:** create in the CF dashboard (Turnstile → Add widget, mode: managed,
   domain `giftbitcoin.app`). Put the **site key** in `src/config/send.ts`
   (`TURNSTILE_SITE_KEY` — currently the dummy always-pass key) and rebuild/redeploy the
   static app. Store the **secret**: `npx wrangler secret put TURNSTILE_SECRET -c worker/wrangler.jsonc`.
3. **Deploy:** `npx wrangler deploy -c worker/wrangler.jsonc` — the route
   `giftbitcoin.app/api/send` is in the config. Rate limits + esplora base are vars there.
4. **Smoke test:** create a passphrase (email-delivery) gift on the live site, fund it,
   send to an address you control; check the mail arrives and `POST /api/send` with a
   three-segment link returns 400.

The Worker stores nothing persistent (rate-limit counters + a 60 s funding-check cache).
Interim domains (giftbitcoin.greerso.com) are rejected by `ALLOWED_ORIGIN` by design.
```

- [ ] **Step 2: TODO.md** — under "Session status — 2026-07-12", mark the implement item done with a one-line summary + add follow-ups:

```markdown
**Done:** send mechanism implemented (PR #N): SPEC v0.3.0 amendments, generated 4-word EFF
passphrases, delivery choice + share tier (Web Share/WhatsApp/SMS), 3-segment QR fragment,
claim normalization + retry-raw back-compat, /api/send Worker (Turnstile + address recompute
+ esplora fail-closed), QR rendering (funding + claim link).

**Follow-ups (not started):**
- [ ] Deploy the send Worker (docs/DEPLOY.md §Send relay): email onboarding, real Turnstile
      keys, `wrangler deploy`, live smoke test.
- [ ] Manual QA: 3-segment QR density scan test on real phone cameras (spec gate before
      promoting the variant).
```

Also remove the now-stale "QR code on the pay screen (placeholder for now; needs a QR encoder)" line from the 2026-07-11 deferred list (done in this PR).

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY.md TODO.md
git commit -m "docs: send-relay deployment runbook + TODO queue update"
```

---

## Self-Review (done at plan time)

- **Spec coverage:** Decisions 1–4 → Tasks 2/5/11; Tier 1 → Task 11; Tier 2 → Tasks 8–11; fragment grammar → Task 3; claim UX + back-compat → Tasks 4/7; create-flow → Tasks 5/6; SPEC amendments (all bullets incl. §5.4 grammar + share-UX section) → Task 1; error handling table → Tasks 7/10/11; testing section → each task's tests (integration/E2E-share-mock deferred: no browser-test infra in repo — noted as follow-up, matches existing repo practice of lib-level tests).
- **Type consistency:** `verifyShareCardPassphrase` return `{ ok, passphrase, errors }` used identically in Tasks 4/7; `SendEnv` shape identical in Tasks 8–10; `qrLink`/`shareLink` distinction enforced in Tasks 6/11 (email always `shareLink`).
- **Placeholder scan:** all steps carry real code/commands; the one deliberately deferred item (real-phone QR scan) is flagged as a report note, not silent.
