<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto, beforeNavigate } from '$app/navigation';
	import { setNav, clearNav } from '$lib/nav.svelte';
	import { createGift, type CreatedGift } from '$lib/crypto/create-gift';
	import {
		buildPackages,
		claimLinkWithPassphrase,
		fullClaimLink,
		parseShareCardFragment,
		verifyShareCard,
		type GiftPackages
	} from '$lib/gift-package';
	import { fetchBtcUsd, usdToBtc, usdToSats, satsToBtc, tipSats, FALLBACK_BTC_USD } from '$lib/pricing';
	import { fmtBtc, money } from '$lib/format';
	import { getUtxos, confirmedValue } from '$lib/esplora';
	import { T_PRESETS, MIN_GIFT_SATS } from '$config/network';
	import { TURNSTILE_SITE_KEY, SEND_API_PATH } from '$config/send';
	import { CARD_DESIGNS } from '$lib/giftcards';
	import GiftCard from '$lib/components/GiftCard.svelte';
	import Qr from '$lib/components/Qr.svelte';
	import { generatePassphrase } from '$lib/crypto/passphrase';

	type Step = 'c1' | 'c3' | 'c4';
	let step = $state<Step>('c1');
	let price = $state(FALLBACK_BTC_USD);

	let design = $state('classic');
	let usdAmount = $state('50');
	let toName = $state('');
	let fromName = $state('');
	let message = $state('');
	let advOpen = $state(false);
	let tipPct = $state(3);
	let expiryDays = $state<30 | 90 | 180>(90);
	let delivery = $state<'self' | 'email'>('self');
	let passOptIn = $state(false);
	let words = $state('');
	let wordsCopied = $state(false);
	const passActive = $derived(delivery === 'email' || passOptIn);

	let canWebShare = $state(false); // set in onMount: browser-only API
	let toEmail = $state('');
	let sendState = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let sendError = $state('');
	let turnstileToken = $state('');
	let turnstileWidget: string | undefined;

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

	let busy = $state(false);
	let error = $state('');
	let gift = $state<CreatedGift | null>(null);
	let packages = $state<GiftPackages | null>(null);
	// key material only depends on expiry + passphrase; reuse the gift (and its
	// possibly-funded address) when only cosmetic fields change (B2).
	let giftKey = $state<{ expiry: number; usePass: boolean; pass: string } | null>(null);
	let fundStatus = $state<'idle' | 'pending'>('idle');
	let fundedSats = $state(0);
	let pollFails = $state(0);
	let copiedAddr = $state(false);
	let linkCopied = $state(false);
	let linkCopyFailed = $state(false);
	let backedUp = $state(false);

	let pollGen = 0;

	const PRESETS = ['25', '50', '100', '250'];
	const usd = $derived(parseFloat(usdAmount) || 0);
	const sats = $derived(usdToSats(usd, price));
	const btcStr = $derived(fmtBtc(usdToBtc(usd, price)));
	const amountValid = $derived(usd > 0 && sats >= MIN_GIFT_SATS);
	// SPEC §8.1: tip is normatively floor(gift_sats × pct) — sats first, USD display derived from it.
	const suggestedTipSats = $derived(tipSats(sats, tipPct));
	const tipUsd = $derived(satsToBtc(suggestedTipSats) * price);
	const usdDisplay = $derived(money(usd));
	const isCustom = $derived(!PRESETS.includes(usdAmount));
	const fundedBtcStr = $derived(fmtBtc(satsToBtc(fundedSats)));
	const fundedUsd = $derived(money(satsToBtc(fundedSats) * price));
	const underfunded = $derived(fundedSats > 0 && fundedSats < sats);
	// The one key-loss predicate all three exit guards share (unload, navigation,
	// regenerate). A fresh page has gift === null, so it stays inert until step c3
	// has shown an address.
	const unsavedKeys = $derived(!!gift && !backedUp);

	onMount(async () => {
		price = await fetchBtcUsd();
		canWebShare = navigator.canShare?.({ url: location.href }) ?? !!navigator.share;
	});

	$effect(() => {
		if (step === 'c1') setNav(() => goto('/'), 'Step 1 of 3 · Your card');
		else if (step === 'c3')
			setNav(() => {
				cancelPoll();
				fundStatus = 'idle';
				step = 'c1';
			}, 'Step 2 of 3 · Pay');
		else setNav(() => goto('/'), 'Step 3 of 3 · Share');
	});

	// Warn before a real page unload (close/refresh) while an un-backed-up gift exists.
	// No step condition: the c3 back arrow parks an un-backed-up (possibly funded)
	// gift on c1, and the guard must hold there too.
	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		if (unsavedKeys) window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	// SvelteKit client-side navigation (the header logo, Done, the back arrow) does
	// NOT fire beforeunload — guard it too, or losing the page silently discards the
	// only copy of the keys after the user may already have funded the address.
	beforeNavigate((navigation) => {
		if (unsavedKeys) {
			const leave = confirm(
				"You haven't saved your gift backup yet. If you've already sent funds, leaving now means no one — including us — can recover them. Leave without saving?"
			);
			if (!leave) navigation.cancel();
		}
	});

	function cancelPoll() {
		pollGen += 1;
	}

	onDestroy(() => {
		cancelPoll(); // bumps pollGen, which every in-flight poll re-checks
		clearNav();
	});

	async function continueToPay() {
		error = '';
		if (!amountValid) {
			error = `Please enter at least ${money(satsToBtc(MIN_GIFT_SATS) * price)} (${MIN_GIFT_SATS.toLocaleString()} sats).`;
			return;
		}
		busy = true;
		try {
			cancelPoll(); // kill any poll from a prior address before (re)building
			if (passActive) ensureWords();
			const pass = passActive ? words : undefined;
			const key = { expiry: expiryDays, usePass: !!pass, pass: pass ?? '' };
			// Regenerate keys only if the security params changed — otherwise keep the
			// existing (possibly-funded) address so a name tweak never orphans funds.
			if (
				!gift ||
				!giftKey ||
				giftKey.expiry !== key.expiry ||
				giftKey.usePass !== key.usePass ||
				giftKey.pass !== key.pass
			) {
				// Regenerating replaces the address. The in-page back arrow bypasses the
				// beforeunload/beforeNavigate guards, so an un-backed-up (possibly already
				// funded) gift needs the same confirmation here.
				if (unsavedKeys) {
					const proceed = confirm(
						"You haven't saved your gift backup yet. Changing these options creates a new gift address — if you've already sent funds to the old one, no one can recover them. Continue?"
					);
					if (!proceed) return;
				}
				gift = await createGift({
					T: T_PRESETS[`days${expiryDays}` as 'days90'],
					policy: 'refund_self',
					passphrase: pass
				});
				giftKey = key;
				backedUp = false;
			}
			packages = buildPackages(gift, {
				amountExpectedSats: sats,
				tipSatsSuggested: suggestedTipSats,
				memo: message.trim() || undefined,
				fromName: fromName.trim() || undefined,
				toName: toName.trim() || undefined,
				cardDesign: design,
				expiryDays,
				origin: window.location.origin
			});
			// SPEC §5.3 self-check on the artifact that actually ships: round-trip
			// the claim link exactly as the recipient's page will parse it and
			// confirm it re-derives the funded script — catches serialization
			// regressions, not just key math. On passphrase gifts this re-runs the
			// 64 MiB Argon2id KDF by design; the independent re-derivation IS the check.
			const link = fullClaimLink(packages.share_card, window.location.origin);
			const check = await verifyShareCard(parseShareCardFragment(link.slice(link.indexOf('#') + 1)), pass);
			if (!check.ok) {
				// Keep `gift` — the address may already be funded from an earlier pass
				// and the keys must stay recoverable; just never show an unverified package.
				packages = null;
				throw new Error('Gift self-check failed (' + check.errors[0] + '). Please try again.');
			}
			fundStatus = 'idle';
			step = 'c3';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function copyAddr() {
		if (!gift) return;
		try {
			await navigator.clipboard.writeText(gift.payment.address);
			copiedAddr = true;
			setTimeout(() => (copiedAddr = false), 1800);
		} catch {
			copiedAddr = false; // address is already visible to select manually
		}
	}

	const shareLink = $derived(
		packages ? fullClaimLink(packages.share_card, window.location.origin) : ''
	);

	// Three-segment QR ONLY for self-sent passphrase-opt-in gifts (SPEC §5.4);
	// email-delivery gifts and all copy/share paths stay two-segment.
	const qrLink = $derived(
		packages && delivery === 'self' && passOptIn && words
			? claimLinkWithPassphrase(packages.share_card, window.location.origin, words)
			: shareLink
	);

	async function copyLink() {
		if (!shareLink) return;
		try {
			await navigator.clipboard.writeText(shareLink);
			linkCopied = true;
			linkCopyFailed = false;
			setTimeout(() => (linkCopied = false), 1800);
		} catch {
			linkCopyFailed = true; // reveal the link text for manual copy
		}
	}

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

	function markSent() {
		if (!gift) return;
		fundStatus = 'pending';
		pollFails = 0;
		pollGen += 1;
		// capture the address so a later regenerate can't retarget this poll
		poll(pollGen, gift.payment.address);
	}

	async function poll(gen: number, addr: string) {
		if (gen !== pollGen) return;
		try {
			const utxos = await getUtxos(addr);
			// Re-check after the await: cancelPoll() may have run while the fetch was
			// in flight, and a stale continuation must not flip the step to 'c4'.
			if (gen !== pollGen) return;
			pollFails = 0;
			const confirmed = confirmedValue(utxos);
			if (confirmed > 0) {
				fundedSats = confirmed;
				step = 'c4';
				return;
			}
		} catch {
			pollFails += 1;
		}
		if (gen !== pollGen) return;
		setTimeout(() => poll(gen, addr), 12_000);
	}

	function download(name: string, obj: unknown) {
		const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function downloadBackup() {
		if (!packages) return;
		download('giftbitcoin-backup.json', packages.sender_full_backup);
		backedUp = true;
	}
</script>

{#if step === 'c1'}
	<h2 class="h2">Choose a card</h2>

	<div class="card-wrap">
		<GiftCard designId={design} {usdDisplay} {btcStr} forName={toName.trim()} />
	</div>

	<div class="thumbs">
		{#each CARD_DESIGNS as d}
			<button class="thumb" onclick={() => (design = d.id)} aria-label={d.name}>
				<span class="thumb-face" class:sel={d.id === design} style="background:{d.bg}"></span>
				<span class="thumb-name" class:sel={d.id === design}>{d.name}</span>
			</button>
		{/each}
	</div>

	<div class="label-caps">Amount</div>
	<div class="chips">
		{#each PRESETS as p}
			<button class="chip" class:on={usdAmount === p} onclick={() => (usdAmount = p)}>${p}</button>
		{/each}
		<button class="chip" class:on={isCustom} onclick={() => (usdAmount = '')}>Custom</button>
	</div>
	<div class="usd-box" class:active={isCustom}>
		<span class="usd-sign">$</span>
		<input class="usd-input" bind:value={usdAmount} inputmode="decimal" placeholder="Enter any amount" />
		<span class="usd-unit">USD</span>
	</div>
	<p class="amount-note">
		They'll receive real bitcoin — about <strong>{btcStr} BTC</strong> at today's rate.
	</p>

	<div class="label-caps">Who's it for?</div>
	<div class="names">
		<input bind:value={toName} placeholder="To (their name)" />
		<input bind:value={fromName} placeholder="From (you)" />
	</div>
	<textarea bind:value={message} placeholder="Add a short message (optional)" rows="2"></textarea>

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

	<button class="adv-toggle" onclick={() => (advOpen = !advOpen)}>
		Advanced options {advOpen ? '▴' : '▾'}
	</button>

	{#if advOpen}
		<div class="adv">
			<div class="card">
				<div class="adv-title">Project tip <span class="muted">— suggested</span></div>
				<div class="adv-note mb">
					Currently {tipPct}% ({money(tipUsd)}). Recorded in your backup for the open-source project —
					tip collection isn't wired up in this testnet build, so you only fund the gift itself.
				</div>
				<div class="chips tight">
					{#each [0, 1, 3, 5] as t}
						<button class="chip" class:on={tipPct === t} onclick={() => (tipPct = t)}>{t}%</button>
					{/each}
				</div>
			</div>

			<div class="card">
				<div class="adv-title">Expiry</div>
				<div class="adv-note mb">If it isn't redeemed, you can reclaim your bitcoin after this long.</div>
				<div class="chips tight">
					{#each [30, 90, 180] as d}
						<button class="chip" class:on={expiryDays === d} onclick={() => (expiryDays = d as 30)}>{d} days</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	{#if error}<p class="error">{error}</p>{/if}

	<button class="btn btn-primary mt-btn" disabled={!amountValid || busy} onclick={continueToPay}>
		{busy ? 'Generating…' : 'Continue to payment'}
	</button>
{/if}

{#if step === 'c3' && gift && packages}
	<h2 class="h2">Pay for your gift card</h2>
	<p class="lede">Send at least <strong>{btcStr} BTC</strong> to this address (testnet).</p>

	<div class="warn-box save-first">
		<strong>Save your gift before you send.</strong> These keys live only in this page until you
		download them — if you lose the page now, the bitcoin can't be recovered by anyone.
		<div class="save-actions">
			<button class="btn btn-primary" onclick={downloadBackup}>
				{backedUp ? 'Backup saved ✓' : 'Download backup'}
			</button>
			<button class="btn btn-secondary" onclick={copyLink}>
				{linkCopied ? 'Link copied ✓' : 'Copy gift link'}
			</button>
		</div>
		{#if linkCopyFailed}
			<div class="copy-fallback mono">{shareLink}</div>
			<div class="fallback-note">Couldn't reach the clipboard — select the link above and copy it.</div>
		{/if}
	</div>

	<div class="pay-card">
		<div class="qr">
			<Qr data={`bitcoin:${gift.payment.address}`} label="Gift address QR" />
		</div>
		<div class="pay-addr">
			<div class="mono addr">{gift.payment.address}</div>
			<button class="btn-copy" onclick={copyAddr}>{copiedAddr ? 'Copied ✓' : 'Copy address'}</button>
			<a class="wallet-link" href={`bitcoin:${gift.payment.address}`}>Open in wallet</a>
		</div>
	</div>

	{#if fundStatus === 'idle'}
		<button class="btn btn-primary" disabled={!backedUp} onclick={markSent}>
			{backedUp ? "I've sent it" : 'Save your backup first ↑'}
		</button>
		<p class="tiny-note">Testnet coins have no value — fund the address from a testnet4 faucet.</p>
	{:else}
		<div class="pending">
			<div class="pulse"></div>
			<div>
				<strong>Waiting for 1 confirmation…</strong> usually about 10 minutes. Watching the address on the
				chain — keep this page open (your keys are only saved in your downloaded backup).
				{#if pollFails >= 3}
					<div class="poll-warn">Can't reach the chain indexer right now — still retrying.</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

{#if step === 'c4' && gift && packages}
	<div class="success-check">✓</div>
	<h2 class="h2">Your gift card is ready</h2>
	<p class="lede">{fundedBtcStr} BTC (≈ {fundedUsd}) is confirmed and waiting to be redeemed.</p>
	{#if underfunded}
		<div class="warn-box mtb">
			Heads up: this is less than the {usdDisplay} you intended. The recipient will still be able to
			redeem the confirmed amount.
		</div>
	{/if}

	<div class="card-wrap">
		<GiftCard designId={design} {usdDisplay} {btcStr} message={message.trim()} fromName={fromName.trim()} />
	</div>

	<div class="warn-box mtb">
		<strong>This link is money.</strong> Anyone who has it can redeem the bitcoin — share it privately,
		like cash.
	</div>

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

	{#if delivery === 'email'}
		<div class="card email-card">
			{#if sendState === 'sent'}
				<div class="success-check small">✓</div>
				<p class="lede">
					Handed to the mail system — confirm it arrived when you send them the 4 words.
				</p>
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
	{#if linkCopyFailed}
		<div class="copy-fallback mono">{shareLink}</div>
	{/if}
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
	<div class="more-dl">
		<button onclick={() => download('giftbitcoin-share-card.json', packages!.share_card)}>Share card file</button>
		<span>·</span>
		<button onclick={() => download('giftbitcoin-watch-only.json', packages!.sender_watch_only)}>Watch-only</button>
	</div>
	<button class="done-link" onclick={() => goto('/')}>Done → back to start</button>
{/if}

<style>
	.card-wrap {
		margin: 0 0 4px;
	}
	.thumbs {
		display: flex;
		gap: 12px;
		margin: 16px 0 26px;
	}
	.thumb {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}
	.thumb-face {
		width: 64px;
		aspect-ratio: 1.586 / 1;
		border-radius: 9px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	}
	.thumb-face.sel {
		box-shadow: 0 0 0 2px var(--surface), 0 0 0 4.5px var(--amber);
	}
	.thumb-name {
		font-size: 11px;
		font-weight: 600;
		color: #8b8578;
	}
	.thumb-name.sel {
		color: var(--warn-ink);
	}
	.label-caps {
		margin-bottom: 10px;
	}
	.chips {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.chips.tight {
		margin-bottom: 0;
	}
	.usd-box {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #fff;
		border: 1.5px solid var(--border-strong);
		border-radius: 12px;
		padding: 12px 16px;
		margin-bottom: 8px;
	}
	.usd-box.active {
		border: 2px solid var(--amber);
	}
	.usd-sign {
		font-size: 18px;
		font-weight: 600;
		color: var(--tan);
	}
	.usd-input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font-size: 18px;
		font-weight: 600;
		padding: 0;
	}
	.usd-unit {
		font-size: 13px;
		font-weight: 500;
		color: var(--tan);
	}
	.amount-note {
		font-size: 13.5px;
		color: var(--muted);
		margin: 0 0 24px;
	}
	.amount-note strong {
		color: var(--ink);
	}
	.names {
		display: flex;
		gap: 10px;
		margin-bottom: 10px;
	}
	textarea {
		margin-bottom: 22px;
	}
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
	.adv-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--link);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		margin-bottom: 14px;
	}
	.adv {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 14px;
	}
	.adv-title {
		font-size: 14px;
		font-weight: 600;
	}
	.adv-title .muted {
		font-weight: 400;
		color: var(--tan);
	}
	.adv-note {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.5;
		margin-top: 8px;
	}
	.adv-note.mb {
		margin-top: 2px;
		margin-bottom: 10px;
	}
	.pass-toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-weight: 600;
	}
	.checkbox {
		width: 18px;
		height: 18px;
		accent-color: var(--amber);
		flex: none;
	}
	.mt-btn {
		margin-top: 6px;
	}
	.error {
		color: var(--danger);
		font-size: 14px;
	}
	.save-first {
		margin-bottom: 16px;
	}
	.save-actions {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}
	.save-actions .btn {
		width: auto;
		flex: 1;
		padding: 12px;
		font-size: 15px;
	}
	.copy-fallback {
		margin-top: 12px;
		font-size: 12px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px;
		color: var(--muted-2);
		user-select: all;
	}
	.fallback-note {
		font-size: 12px;
		margin-top: 6px;
	}
	.pay-card {
		display: flex;
		gap: 18px;
		align-items: center;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 18px;
		margin-bottom: 16px;
	}
	.qr {
		flex: none;
		width: 104px;
	}
	.pay-addr {
		flex: 1;
		min-width: 0;
	}
	.addr {
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--muted-2);
		margin-bottom: 10px;
	}
	.btn-copy {
		padding: 8px 14px;
		border: 1.5px solid var(--border-btn);
		border-radius: 9px;
		background: #fff;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
	}
	.btn-copy:hover {
		background: #f6f1e6;
	}
	.wallet-link {
		display: inline-block;
		margin-left: 10px;
		font-size: 13px;
		font-weight: 600;
	}
	.tiny-note {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 12px;
	}
	.pending {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		border-radius: 12px;
		padding: 16px 18px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--warn-ink);
	}
	.poll-warn {
		margin-top: 8px;
		font-weight: 600;
	}
	.pulse {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--amber);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}
	.mtb {
		margin: 18px 0 20px;
	}
	.share-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.claim-qr {
		max-width: 240px;
		margin: 18px auto 0;
		text-align: center;
	}
	.more-dl {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-top: 14px;
		font-size: 13px;
		color: var(--muted);
	}
	.more-dl button {
		background: none;
		border: none;
		color: var(--link);
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		padding: 0;
	}
	.done-link {
		font-size: 14px;
		font-weight: 600;
		color: var(--link);
		cursor: pointer;
		margin-top: 22px;
		display: block;
		background: none;
		border: none;
		padding: 0;
	}
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
</style>
