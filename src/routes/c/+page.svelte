<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto, beforeNavigate } from '$app/navigation';
	import { setNav, clearNav } from '$lib/nav.svelte';
	import * as btc from '@scure/btc-signer';
	import {
		parseShareCardFragment,
		isGiftFragment,
		verifyShareCard,
		verifyShareCardPassphrase,
		fragmentPassphrase,
		CORRUPT_LINK_MSG
	} from '$lib/gift-package';
	import {
		claimPrivFromSecret,
		claimPrivFromPassphrase,
		xOnlyFromPriv,
		hexToBytesStrict,
		b64urlToBytes
	} from '$lib/crypto/keys';
	import { buildClaimTx, type ClaimTxResult } from '$lib/claim-tx';
	import { getUtxos, confirmedValue, hasMempool, recommendedFeeRate, broadcastTx } from '$lib/esplora';
	import { fetchBtcUsd, satsToBtc, FALLBACK_BTC_USD } from '$lib/pricing';
	import { money, fmtBtc, truncMiddle } from '$lib/format';
	import { ACTIVE_NETWORK, DEFAULT_EXPLORER_TX } from '$config/network';
	import GiftCard from '$lib/components/GiftCard.svelte';

	type Screen = 'loading' | 'nolink' | 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'help';
	let screen = $state<Screen>('loading');

	interface Loaded {
		/** the parsed share_card as it arrived — the wire form integrity checks run on */
		sc: Record<string, unknown>;
		address: string;
		amountSats: number;
		C_xonly: string;
		R_xonly: string;
		T: number;
		nums_xonly: string;
		script_pub_key?: string;
		secret: Uint8Array;
		passphraseRequired: boolean;
		memo: string;
		fromName: string;
		design: string;
	}
	let g = $state<Loaded | null>(null);
	let price = $state(FALLBACK_BTC_USD);
	let isDesktop = $state(false);
	let chainStatus = $state<'checking' | 'ready' | 'awaiting' | 'empty' | 'unknown'>('checking');

	let pasteLink = $state('');
	let loadError = $state('');
	let dest = $state<'phoenix' | 'sparrow' | 'exchange' | 'paste'>('paste');
	let address = $state('');
	let addrError = $state('');
	let passphrase = $state('');
	// Third fragment segment (QR-only self-sent gifts, SPEC §5.4): when present,
	// prepareClaim tries it before ever showing the manual prompt.
	let embeddedPass = $state<string | null>(null);
	let embeddedFailed = $state(false);
	let passFails = $state(0);

	let preparing = $state(false);
	let prepError = $state('');
	let prep = $state<ClaimTxResult | null>(null);
	let amountsChanged = $state(false);
	let sending = $state(false);
	let sentTxid = $state('');
	// Derived once per successful prepare; redeem reuses it. Deterministic from
	// secret (+ passphrase), and any passphrase edit must pass back through
	// prepareClaim to make `prep` non-null again — so it cannot go stale. Avoids
	// re-running the 64 MiB Argon2id KDF on every redeem click.
	let claimPriv: Uint8Array | null = null;

	const btcStr = $derived(g ? fmtBtc(satsToBtc(g.amountSats)) : '0');
	const usdDisplay = $derived(g ? money(satsToBtc(g.amountSats) * price) : '$0');
	const isExchangeDest = $derived(dest === 'exchange');

	const GUIDES: Record<string, { title: string; steps: string[] }> = {
		phoenix: {
			title: 'Set up Phoenix',
			steps: [
				'Install the free Phoenix app from your app store.',
				'Open it and tap “Receive”.',
				'Tap “Copy address”, then paste it below.'
			]
		},
		sparrow: {
			title: 'Set up Sparrow',
			steps: [
				'Download Sparrow Wallet from sparrowwallet.com.',
				'Create a wallet and open the “Receive” tab.',
				'Copy the address shown, then paste it below.'
			]
		},
		exchange: {
			title: 'Get your exchange address',
			steps: [
				'Open your exchange app (Coinbase, Kraken, Gemini…).',
				'Find “Receive” or “Deposit” and choose Bitcoin.',
				'Copy the address it shows, then paste it below.'
			]
		},
		paste: {
			title: 'Paste your address',
			steps: [
				'Open your wallet and find “Receive”.',
				'Copy the bitcoin address.',
				'Paste it below — we’ll double-check it looks right.'
			]
		}
	};
	const guide = $derived(GUIDES[dest] ?? GUIDES.paste);

	function loadFromFragment(frag: string): boolean {
		try {
			const sc = parseShareCardFragment(frag) as any;
			const script = sc.script ?? {};
			const claim = sc.claim ?? {};
			if (!script.address || !claim.secret_b64url) throw new Error('missing fields');
			g = {
				sc,
				address: script.address,
				amountSats: Number(sc.amount_expected_sats) || 0,
				C_xonly: script.C_xonly,
				R_xonly: script.R_xonly,
				T: Number(script.T),
				nums_xonly: script.nums_xonly,
				script_pub_key: script.script_pub_key,
				secret: b64urlToBytes(claim.secret_b64url, 32),
				passphraseRequired: Boolean(claim.passphrase_required),
				memo: sc.memo ?? '',
				fromName: sc.from_name ?? '',
				design: sc.card_design ?? 'midnight'
			};
			return true;
		} catch {
			return false;
		}
	}

	// One classifier for both entry points (URL fragment + pasted link), so the
	// same broken link never gets two different explanations.
	function openFragment(frag: string, notGiftMsg = '') {
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
		screen = 'nolink';
		loadError = isGiftFragment(frag)
			? CORRUPT_LINK_MSG
			: frag.startsWith('v1.')
				? 'This is a short link. Open the full gift link (or paste the sender’s backup file link) to redeem.'
				: notGiftMsg;
	}

	onMount(async () => {
		isDesktop = window.matchMedia?.('(min-width:720px)').matches ?? false;
		const hash = window.location.hash ?? '';
		openFragment(hash.startsWith('#') ? hash.slice(1) : hash);
		price = await fetchBtcUsd();
	});

	// Generation counter for the claim flow: back-navigation, a new prepare, a new
	// redeem, or unmount bumps it, and in-flight async work re-checks it after every
	// await so a stale continuation can never write state or broadcast.
	let claimGen = 0;

	$effect(() => {
		if (sending) {
			// No back arrow while a broadcast is in flight — the user must land on
			// the txid screen, not navigate away from a transaction that went out.
			setNav(null);
			return;
		}
		const back: Record<Screen, (() => void) | null> = {
			loading: null,
			nolink: () => goto('/'),
			r0: () => goto('/'),
			r1: () => (screen = 'r0'),
			r2: () => (screen = 'r1'),
			r3: () => (screen = 'r2'),
			r4: null,
			help: () => (screen = 'r1')
		};
		const target = back[screen] ?? (() => goto('/'));
		setNav(() => {
			claimGen += 1;
			target();
		});
	});

	// Block client-side navigation (header logo) during the brief broadcast window
	// so the tx can't go out with no one left to show the txid to.
	beforeNavigate((navigation) => {
		if (sending) navigation.cancel();
	});

	onDestroy(() => {
		claimGen += 1;
		clearNav();
	});

	async function checkChain() {
		if (!g) return;
		try {
			const utxos = await getUtxos(g.address);
			if (confirmedValue(utxos) > 0) chainStatus = 'ready';
			else if (hasMempool(utxos)) chainStatus = 'awaiting';
			else chainStatus = 'empty';
		} catch {
			chainStatus = 'unknown';
		}
	}

	function loadPasted() {
		loadError = '';
		const raw = pasteLink.trim();
		const hashIdx = raw.indexOf('#');
		openFragment(
			hashIdx >= 0 ? raw.slice(hashIdx + 1) : raw,
			'That link doesn’t contain a gift. Paste the full link the sender gave you.'
		);
	}

	function pick(d: typeof dest) {
		dest = d;
		address = '';
		addrError = '';
		screen = 'r2';
	}

	function validTestnetAddress(a: string): boolean {
		try {
			btc.Address(ACTIVE_NETWORK.scure).decode(a.trim());
			return true;
		} catch {
			return false;
		}
	}

	async function submitAddr() {
		const a = address.trim();
		if (/^(bc1|[13])/i.test(a) && !/^tb1/i.test(a)) {
			addrError = 'That looks like a mainnet address. This is a testnet gift — use a testnet address.';
			return;
		}
		if (!validTestnetAddress(a)) {
			addrError =
				'That doesn’t look like a bitcoin address. In test mode it usually starts with “tb1” and has no spaces.';
			return;
		}
		if (g?.passphraseRequired && !passphrase && !(embeddedPass && !embeddedFailed)) {
			addrError = 'This gift needs its 4 secret words — enter them above to continue.';
			return;
		}
		addrError = '';
		screen = 'r3';
		await prepareClaim();
	}

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
				// Double-Argon2id cost: verifyShareCardPassphrase already derived
				// internally to check integrity, and this re-derives for the priv key.
				// ponytail: 2× Argon2id per successful prepare; plumb the priv out of
				// verify if it ever hurts.
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
			if (gen !== claimGen) return;
			if (confirmedValue(utxos) <= 0) {
				prepError = hasMempool(utxos)
					? 'This gift is funded but still waiting to confirm on the chain. Try again in a few minutes.'
					: 'This gift isn’t funded yet, or it has already been redeemed.';
				return;
			}
			const feeRate = await recommendedFeeRate();
			if (gen !== claimGen) return;
			prep = buildClaimTx({
				claimPriv: priv,
				C,
				R: hexToBytesStrict(g.R_xonly, 32),
				T: g.T,
				utxos,
				destAddress: address.trim(),
				feeRate,
				network: ACTIVE_NETWORK.scure
			});
			claimPriv = priv;
		} catch (e) {
			if (gen !== claimGen) return;
			prepError = e instanceof Error ? e.message : String(e);
		} finally {
			// A superseded run must not clobber the live run's flag.
			if (gen === claimGen) preparing = false;
		}
	}

	async function redeem() {
		if (!prep || !g || !claimPriv || sending) return;
		const gen = ++claimGen;
		// What the user approved on the review screen — a concurrent prepareClaim
		// resetting `prep` must not change the comparison basis (or crash it).
		const reviewed = prep;
		const priv = claimPriv;
		sending = true;
		prepError = '';
		amountsChanged = false;
		try {
			// SPEC §6.4 reorg rule (and the §6.3.6 claim/expiry race): re-fetch UTXOs
			// and rebuild immediately before broadcast so a reorg / since-confirmed /
			// since-spent change is reflected, not the stale tx.
			const C = xOnlyFromPriv(priv);
			const utxos = await getUtxos(g.address);
			if (gen !== claimGen) return;
			if (confirmedValue(utxos) <= 0) {
				prepError = 'This gift is no longer funded — it may have just been redeemed.';
				return;
			}
			const feeRate = await recommendedFeeRate();
			// Last await before the irreversible step — from here to broadcastTx is
			// synchronous, so no user event can retarget the address or cancel.
			if (gen !== claimGen) return;
			const next = buildClaimTx({
				claimPriv: priv,
				C,
				R: hexToBytesStrict(g.R_xonly, 32),
				T: g.T,
				utxos,
				destAddress: address.trim(),
				feeRate,
				network: ACTIVE_NETWORK.scure
			});
			prep = next;
			// SPEC §7.2.1.9: never broadcast amounts the user didn't approve. If the
			// sweep changed in either direction (new UTXO confirmed, or one reorged
			// out — hence !== and not >) or the net shrank (fee rose), show the
			// updated review instead. A net increase at the same gross only favors
			// the recipient, so it goes through.
			if (next.grossSats !== reviewed.grossSats || next.netSats < reviewed.netSats) {
				amountsChanged = true;
				return;
			}
			sentTxid = await broadcastTx(next.hex);
			// The tx is out — always land on the txid screen (nav is locked while
			// sending, so nothing else can have taken over the page).
			screen = 'r4';
		} catch (e) {
			if (gen !== claimGen) return;
			prepError = 'Broadcast failed: ' + (e instanceof Error ? e.message : String(e));
		} finally {
			// Always release: `sending` gates redeem re-entry and the nav lock.
			sending = false;
		}
	}

	const netStr = $derived(
		prep ? fmtBtc(satsToBtc(prep.netSats)) + ' BTC (≈ ' + money(satsToBtc(prep.netSats) * price) + ')' : ''
	);
	const feeStr = $derived(prep ? money(satsToBtc(prep.feeSats) * price) : '');
	// Real on-chain balance being swept — keeps gross − fee = net consistent, rather
	// than the sender-claimed amount_expected_sats (which may over/understate it).
	const grossStr = $derived(
		prep ? fmtBtc(satsToBtc(prep.grossSats)) + ' BTC (≈ ' + money(satsToBtc(prep.grossSats) * price) + ')' : ''
	);
</script>

{#if screen === 'loading'}
	<p class="lede">Loading your gift…</p>
{/if}

{#if screen === 'nolink'}
	<h2 class="h2">Open your gift link</h2>
	<p class="lede">
		Paste the gift link someone sent you and we’ll walk you through redeeming it — about two minutes,
		no account needed.
	</p>
	<textarea bind:value={pasteLink} placeholder="https://giftbitcoin.app/c#…" rows="3" class="mono"></textarea>
	{#if loadError}<p class="err">{loadError}</p>{/if}
	<button class="btn btn-primary mt" onclick={loadPasted}>Open gift</button>
{/if}

{#if screen === 'r0' && g}
	<div class="card-wrap">
		<GiftCard
			designId={g.design}
			{usdDisplay}
			{btcStr}
			label="A gift for you"
			message={g.memo}
			fromName={g.fromName}
		/>
	</div>
	<button
		class="badge"
		class:warn={chainStatus === 'empty' || chainStatus === 'unknown'}
		onclick={checkChain}
	>
		<span class="badge-dot"></span>
		{#if chainStatus === 'ready'}Ready to redeem{:else if chainStatus === 'awaiting'}Funds confirming…{:else if chainStatus === 'empty'}Not funded yet{:else if chainStatus === 'checking'}Checking…{:else}Couldn't reach the chain — tap to retry{/if}
	</button>
	<h2 class="h2">Someone sent you bitcoin</h2>
	<p class="lede">
		New to bitcoin? That’s OK — we’ll walk you through it, step by step. It takes about two minutes.
	</p>
	<button class="btn btn-primary" onclick={() => (screen = 'r1')}>Redeem your bitcoin</button>
{/if}

{#if screen === 'r1'}
	<h2 class="h2">Where should we send it?</h2>
	<p class="lede">Your bitcoin needs a home. Pick whatever feels easiest.</p>

	<button class="rec" onclick={() => pick(isDesktop ? 'sparrow' : 'phoenix')}>
		<span class="rec-tag">Recommended</span>
		<span class="rec-title">
			{isDesktop ? 'Sparrow — a wallet on this computer' : 'Phoenix — a free wallet app'}
		</span>
		<span class="rec-desc">
			{isDesktop
				? 'Your bitcoin, on your own machine.'
				: 'Your bitcoin, on your phone. Takes about a minute to set up.'}
		</span>
	</button>

	<div class="opts">
		<button class="opt" onclick={() => pick('exchange')}>
			<div class="opt-title">An exchange account</div>
			<div class="opt-desc">Coinbase, Kraken, Gemini — if you already have one</div>
		</button>
		<button class="opt" onclick={() => pick('paste')}>
			<div class="opt-title">I have a bitcoin address</div>
			<div class="opt-desc">Paste any address from any wallet</div>
		</button>
		<button class="opt" onclick={() => (screen = 'help')}>
			<div class="opt-title">Help me choose</div>
			<div class="opt-desc">A 30-second guide, no jargon</div>
		</button>
	</div>
{/if}

{#if screen === 'r2'}
	<h2 class="h2">{guide.title}</h2>
	<div class="steps">
		{#each guide.steps as s, i}
			<div class="stepline">
				<div class="stepnum">{i + 1}</div>
				<div class="steptext">{s}</div>
			</div>
		{/each}
	</div>
	{#if g?.passphraseRequired && (!embeddedPass || embeddedFailed)}
		<div class="label-caps">The 4 secret words</div>
		{#if embeddedFailed}
			<p class="err">
				The scanned code's built-in words didn't match this gift — enter the 4 words from the sender.
			</p>
		{/if}
		<input bind:value={passphrase} placeholder="Enter the 4 secret words from the sender." class="mb" />
	{/if}
	<div class="label-caps">Paste your bitcoin address</div>
	<textarea bind:value={address} placeholder="tb1q…" rows="3" class="mono"></textarea>
	{#if addrError}<p class="err">{addrError}</p>{/if}
	<button class="btn btn-primary mt" onclick={submitAddr}>Continue</button>
{/if}

{#if screen === 'r3' && g}
	<h2 class="h2">Review</h2>
	{#if preparing}
		<p class="lede">Checking the gift on the chain and preparing your transaction…</p>
	{:else if prepError}
		<div class="warn-box">{prepError}</div>
		<button class="btn btn-secondary mt" onclick={() => (screen = 'r2')}>Back</button>
	{:else if prep}
		<div class="review card">
			<div class="rrow">
				<span class="rk">Gift balance</span><span class="rv">{grossStr}</span>
			</div>
			<div class="rrow">
				<span class="rk">Network fee</span><span class="rv">− {feeStr}</span>
			</div>
			<div class="rrow">
				<span class="rk">You receive</span><span class="rv net">{netStr}</span>
			</div>
			<div class="rrow last">
				<span class="rk">To</span><span class="rv mono small">{truncMiddle(address.trim())}</span>
			</div>
		</div>
		{#if amountsChanged}
			<div class="warn-box mb">
				The gift balance or network fee changed while you were reviewing. Check the updated
				amounts above, then redeem.
			</div>
		{/if}
		{#if g.amountSats && prep.grossSats < g.amountSats}
			<div class="warn-box mb">
				This gift holds less than the sender intended ({usdDisplay}). You’ll still receive the full
				confirmed balance shown above.
			</div>
		{/if}
		{#if isExchangeDest}
			<div class="info-box mb">
				Exchanges hold bitcoin on your behalf. Someday, you might like moving it to a wallet only you
				control — no rush, and no pressure.
			</div>
		{/if}
		<p class="fine">
			Redeeming sweeps the confirmed balance in one transaction. If any funds are still confirming,
			keep the link — you can redeem those once they confirm.
		</p>
		<button class="btn btn-primary" disabled={sending} onclick={redeem}>
			{sending ? 'Sending…' : 'Redeem my bitcoin'}
		</button>
	{/if}
{/if}

{#if screen === 'r4' && g}
	<div class="success-check">✓</div>
	<h2 class="h2">It's on the way</h2>
	<p class="lede">{netStr} has been broadcast to your address. Nothing else to do.</p>
	<div class="card txcard">
		<div class="label-caps">Transaction</div>
		<a class="mono small" href={DEFAULT_EXPLORER_TX + sentTxid} target="_blank" rel="noreferrer">
			{truncMiddle(sentTxid, 12, 8)} ↗
		</a>
	</div>
	{#if isExchangeDest}
		<div class="info-box mb">
			Heads up: exchanges can take 10–60 minutes to show incoming bitcoin. It's normal.
		</div>
	{/if}
	<p class="fine">
		The confirmed balance has been sent. If any funds were still confirming, keep the link — you can
		redeem them once they confirm.
	</p>
	<button class="done-link" onclick={() => goto('/')}>Done</button>
{/if}

{#if screen === 'help'}
	<h2 class="h2">Which option should I pick?</h2>
	<div class="faq">
		<div class="card">
			<div class="faq-q">On a phone, nothing set up?</div>
			<div class="faq-a"><strong>Phoenix</strong> — a free wallet app. About a minute to set up.</div>
		</div>
		<div class="card">
			<div class="faq-q">Already use Coinbase or Kraken?</div>
			<div class="faq-a">Use your exchange — paste its Bitcoin deposit address.</div>
		</div>
		<div class="card">
			<div class="faq-q">Know your way around?</div>
			<div class="faq-a">Paste any address from any wallet.</div>
		</div>
	</div>
	<button class="btn btn-primary mt" onclick={() => (screen = 'r1')}>Back to redeeming</button>
{/if}

<style>
	.card-wrap {
		margin-bottom: 18px;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--success-bg);
		color: var(--success);
		font-size: 13px;
		font-weight: 600;
		border: none;
		border-radius: 999px;
		padding: 6px 14px;
		margin-bottom: 16px;
		font-family: var(--font-body);
		cursor: pointer;
	}
	.badge.warn {
		background: var(--warn-bg);
		color: var(--warn-ink);
	}
	.badge-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.err {
		color: var(--danger);
		font-size: 13.5px;
		margin-top: 8px;
		line-height: 1.5;
	}
	.mt {
		margin-top: 20px;
	}
	.mb {
		margin-bottom: 16px;
	}
	.rec {
		display: block;
		width: 100%;
		text-align: left;
		background: #fff;
		border: 2px solid var(--amber);
		border-radius: 16px;
		padding: 18px;
		margin-bottom: 12px;
		cursor: pointer;
		box-shadow: 0 4px 14px rgba(201, 114, 16, 0.1);
	}
	.rec:hover {
		background: #fdf9f1;
	}
	.rec-tag {
		display: inline-block;
		background: var(--warn-bg);
		color: var(--warn-ink);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border-radius: 6px;
		padding: 3px 8px;
		margin-bottom: 10px;
	}
	.rec-title {
		display: block;
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 3px;
	}
	.rec-desc {
		display: block;
		font-size: 14px;
		color: var(--muted);
		line-height: 1.5;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.opt {
		text-align: left;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 16px 18px;
		cursor: pointer;
	}
	.opt:hover {
		border-color: var(--amber);
	}
	.opt-title {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 2px;
	}
	.opt-desc {
		font-size: 13.5px;
		color: var(--muted);
		line-height: 1.45;
	}
	.steps {
		display: flex;
		flex-direction: column;
		margin: 18px 0 24px;
	}
	.stepline {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 10px 0;
	}
	.stepnum {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: #f3ebdb;
		color: var(--warn-ink);
		font-size: 13px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.steptext {
		font-size: 14.5px;
		line-height: 1.55;
		color: var(--muted-2);
		padding-top: 2px;
	}
	.review {
		padding: 6px 18px;
		margin-bottom: 16px;
	}
	.rrow {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 13px 0;
		border-bottom: 1px solid #f2ede1;
		font-size: 14.5px;
	}
	.rrow.last {
		border-bottom: none;
	}
	.rk {
		color: var(--muted);
		flex: none;
	}
	.rv {
		font-weight: 600;
		text-align: right;
	}
	.rv.net {
		font-weight: 700;
		color: var(--success);
	}
	.small {
		font-size: 13px;
		color: var(--muted-2);
		font-weight: 500;
	}
	.fine {
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--muted);
		margin-bottom: 20px;
	}
	.txcard {
		margin-bottom: 14px;
	}
	.faq {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.faq-q {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.faq-a {
		font-size: 14px;
		line-height: 1.55;
		color: var(--muted);
	}
	.faq-a strong {
		color: var(--ink);
	}
	.done-link {
		font-size: 14px;
		font-weight: 600;
		color: var(--link);
		cursor: pointer;
		margin-top: 24px;
		background: none;
		border: none;
		padding: 0;
	}
	.label-caps {
		margin-bottom: 10px;
	}
</style>
