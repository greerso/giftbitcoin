<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { setNav, clearNav } from '$lib/nav.svelte';
	import { createGift, type CreatedGift } from '$lib/crypto/create-gift';
	import { buildPackages, claimUrl, fullClaimLink, type GiftPackages } from '$lib/gift-package';
	import { fetchBtcUsd, usdToBtc, usdToSats, satsToBtc, FALLBACK_BTC_USD } from '$lib/pricing';
	import { fmtBtc, money } from '$lib/format';
	import { getUtxos, confirmedValue } from '$lib/esplora';
	import { T_PRESETS, MIN_GIFT_SATS } from '$config/network';
	import { CARD_DESIGNS } from '$lib/giftcards';
	import GiftCard from '$lib/components/GiftCard.svelte';
	import * as btc from '@scure/btc-signer';

	type Step = 'c1' | 'c3' | 'c4';
	let step = $state<Step>('c1');
	let price = $state(FALLBACK_BTC_USD);

	let design = $state('classic');
	let usdAmount = $state('50');
	let toName = $state('');
	let fromName = $state('');
	let message = $state('');
	let advOpen = $state(false);
	let speed = $state('normal');
	let tipPct = $state(3);
	let expiryDays = $state<30 | 90 | 180>(90);
	let usePass = $state(false);
	let passphrase = $state('');

	let busy = $state(false);
	let error = $state('');
	let gift = $state<CreatedGift | null>(null);
	let packages = $state<GiftPackages | null>(null);
	let fundStatus = $state<'idle' | 'pending'>('idle');
	let copiedAddr = $state(false);
	let linkCopied = $state(false);
	let backedUp = $state(false);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	const PRESETS = ['25', '50', '100', '250'];
	const SPEEDS = [
		{ id: 'economy', name: 'Economy', rate: 2, eta: '2–6 hours' },
		{ id: 'normal', name: 'Standard', rate: 6, eta: '~30 minutes' },
		{ id: 'priority', name: 'Priority', rate: 15, eta: '~10 minutes' }
	];

	const usd = $derived(parseFloat(usdAmount) || 0);
	const sats = $derived(usdToSats(usd, price));
	const btcStr = $derived(fmtBtc(usdToBtc(usd, price)));
	const amountValid = $derived(usd > 0 && sats >= MIN_GIFT_SATS);
	const tipUsd = $derived((usd * tipPct) / 100);
	const totalUsd = $derived(usd + tipUsd);
	const totalBtcStr = $derived(fmtBtc(usdToBtc(totalUsd, price)));
	const speedObj = $derived(SPEEDS.find((s) => s.id === speed) ?? SPEEDS[1]);
	const feeBtc = $derived((140 * speedObj.rate) / 1e8);
	const feeEstStr = $derived(money(feeBtc * price) + ' (' + fmtBtc(feeBtc) + ' BTC)');
	const usdDisplay = $derived(money(usd));
	const isCustom = $derived(!PRESETS.includes(usdAmount));

	onMount(async () => {
		price = await fetchBtcUsd();
	});

	$effect(() => {
		if (step === 'c1') setNav(() => goto('/'), 'Step 1 of 3 · Your card');
		else if (step === 'c3') setNav(() => (step = 'c1'), 'Step 2 of 3 · Pay');
		else setNav(() => goto('/'), 'Step 3 of 3 · Share');
	});

	onDestroy(() => {
		if (pollTimer) clearTimeout(pollTimer);
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
			const g = await createGift({
				T: T_PRESETS[`days${expiryDays}` as 'days90'],
				policy: 'refund_self',
				passphrase: usePass && passphrase ? passphrase : undefined,
				network: btc.TEST_NETWORK
			});
			const origin = window.location.origin;
			packages = buildPackages(g, {
				amountExpectedSats: sats,
				tipSatsSuggested: usdToSats(tipUsd, price),
				memo: message.trim() || undefined,
				fromName: fromName.trim() || undefined,
				toName: toName.trim() || undefined,
				cardDesign: design,
				expiryDays,
				origin
			});
			gift = g;
			fundStatus = 'idle';
			step = 'c3';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function copyAddr() {
		if (!gift) return;
		navigator.clipboard?.writeText(gift.payment.address).catch(() => {});
		copiedAddr = true;
		setTimeout(() => (copiedAddr = false), 1800);
	}

	function markSent() {
		fundStatus = 'pending';
		poll();
	}

	async function poll() {
		if (!gift) return;
		try {
			const utxos = await getUtxos(gift.payment.address);
			if (confirmedValue(utxos) > 0) {
				step = 'c4';
				return;
			}
		} catch {
			/* transient indexer error — keep polling */
		}
		pollTimer = setTimeout(poll, 12_000);
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

	const shareLink = $derived(
		packages && gift ? fullClaimLink(packages.share_card, window.location.origin) : ''
	);

	function copyLink() {
		if (!shareLink) return;
		navigator.clipboard?.writeText(shareLink).catch(() => {});
		linkCopied = true;
		setTimeout(() => (linkCopied = false), 1800);
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
				<span
					class="thumb-face"
					class:sel={d.id === design}
					style="background:{d.bg}"
				></span>
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
		<input
			class="usd-input"
			bind:value={usdAmount}
			inputmode="decimal"
			placeholder="Enter any amount"
		/>
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

	<button class="adv-toggle" onclick={() => (advOpen = !advOpen)}>
		Advanced options {advOpen ? '▴' : '▾'}
	</button>

	{#if advOpen}
		<div class="adv">
			<div class="card">
				<div class="adv-title">Network fee speed <span class="muted">— when it's redeemed</span></div>
				<div class="chips tight">
					{#each SPEEDS as s}
						<button class="chip" class:on={speed === s.id} onclick={() => (speed = s.id)}>{s.name}</button>
					{/each}
				</div>
				<div class="adv-note">Estimated fee: <strong>{feeEstStr}</strong> · confirms in {speedObj.eta}</div>
			</div>

			<div class="card">
				<div class="adv-title">Project tip</div>
				<div class="adv-note mb">Currently {tipPct}% ({money(tipUsd)}) — keeps giftbitcoin free and running.</div>
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

			<div class="card">
				<label class="pass-toggle">
					<input type="checkbox" bind:checked={usePass} class="checkbox" />
					<span class="adv-title">Require a passphrase to redeem</span>
				</label>
				{#if usePass}
					<input class="mt" bind:value={passphrase} placeholder="e.g. happy birthday mel" />
					<div class="adv-note mt-sm">Share it separately — like the PIN on a gift card.</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if error}<p class="error">{error}</p>{/if}

	<button class="btn btn-primary mt-btn" disabled={!amountValid || busy} onclick={continueToPay}>
		{busy ? 'Generating…' : 'Continue to payment'}
	</button>
{/if}

{#if step === 'c3' && gift}
	<h2 class="h2">Pay for your gift card</h2>
	<p class="lede">
		Total <strong>{money(totalUsd)}</strong> — send at least
		<strong>{fmtBtc(usdToBtc(usd, price))} BTC</strong> to this address (testnet).
	</p>

	<div class="pay-card">
		<div class="qr" aria-hidden="true">QR<br />soon</div>
		<div class="pay-addr">
			<div class="mono addr">{gift.payment.address}</div>
			<button class="btn-copy" onclick={copyAddr}>{copiedAddr ? 'Copied ✓' : 'Copy address'}</button>
			<a class="wallet-link" href={`bitcoin:${gift.payment.address}`}>Open in wallet</a>
		</div>
	</div>

	<div class="label-caps mt">How will you pay?</div>
	<div class="fund-opts">
		{#each [{ id: 'have', title: 'I already have bitcoin', desc: 'Send from your own wallet or exchange' }, { id: 'buy', title: 'I need to buy some first', desc: 'Buy on any exchange, then send it here' }, { id: 'guide', title: 'Walk me through it', desc: 'Step-by-step with a testnet faucet' }] as f}
			<div class="fund-opt card">
				<div class="fund-title">{f.title}</div>
				<div class="fund-desc">{f.desc}</div>
			</div>
		{/each}
	</div>

	{#if fundStatus === 'idle'}
		<button class="btn btn-primary" onclick={markSent}>I've sent it</button>
		<p class="tiny-note">Testnet coins have no value — fund the address from a testnet4 faucet.</p>
	{:else}
		<div class="pending">
			<div class="pulse"></div>
			<div>
				<strong>Waiting for 1 confirmation…</strong> usually about 10 minutes. You can leave this page —
				your gift card will be ready when you return. Watching the address on the chain.
			</div>
		</div>
	{/if}
{/if}

{#if step === 'c4' && gift && packages}
	<div class="success-check">✓</div>
	<h2 class="h2">Your gift card is ready</h2>
	<p class="lede">{usdDisplay} in bitcoin is confirmed and waiting to be redeemed.</p>

	<div class="card-wrap">
		<GiftCard
			designId={design}
			{usdDisplay}
			{btcStr}
			message={message.trim()}
			fromName={fromName.trim()}
		/>
	</div>

	<div class="warn-box mtb">
		<strong>This link is money.</strong> Anyone who has it can redeem the bitcoin — share it privately,
		like cash.
	</div>

	<div class="share-actions">
		<button class="btn btn-primary" onclick={downloadBackup}>
			{backedUp ? 'Backup downloaded ✓' : 'Download backup'}
		</button>
		<button class="btn btn-secondary" onclick={copyLink}>
			{linkCopied ? 'Link copied ✓' : 'Copy gift link'}
		</button>
	</div>
	<div class="more-dl">
		<button onclick={() => download('giftbitcoin-share-card.json', packages!.share_card)}>Share card file</button>
		<span>·</span>
		<button onclick={() => download('giftbitcoin-watch-only.json', packages!.sender_watch_only)}>Watch-only</button>
	</div>
	<p class="backup-note">
		The backup file contains your gift link{usePass && passphrase
			? ' (the passphrase is not included — share it separately)'
			: ''}. If the link is lost, no one — including us — can recover the bitcoin.
	</p>
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
	.mt {
		margin-top: 12px;
	}
	.mt-sm {
		margin-top: 8px;
	}
	.mt-btn {
		margin-top: 6px;
	}
	.error {
		color: var(--danger);
		font-size: 14px;
	}
	/* pay */
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
		height: 104px;
		border-radius: 10px;
		background: repeating-linear-gradient(45deg, #ede6d6 0 8px, #f7f2e7 8px 16px);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 11px;
		color: #9a8e71;
		text-align: center;
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
	.fund-opts {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 26px;
	}
	.fund-title {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 2px;
	}
	.fund-desc {
		font-size: 13.5px;
		color: var(--muted);
		line-height: 1.45;
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
	/* share */
	.mtb {
		margin: 18px 0 20px;
	}
	.share-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
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
	.backup-note {
		font-size: 13px;
		color: var(--muted);
		line-height: 1.55;
		margin-top: 14px;
	}
	.done-link {
		font-size: 14px;
		font-weight: 600;
		color: var(--link);
		cursor: pointer;
		margin-top: 22px;
		background: none;
		border: none;
		padding: 0;
	}
</style>
