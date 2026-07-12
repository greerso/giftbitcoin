<script lang="ts">
	import { cardDesign } from '$lib/giftcards';

	let {
		designId = 'classic',
		usdDisplay,
		btcStr,
		label = undefined,
		forName = '',
		message = '',
		fromName = ''
	}: {
		designId?: string;
		usdDisplay: string;
		btcStr: string;
		/** overrides the design's default label (e.g. claim shows "A gift for you") */
		label?: string;
		/** create step 1 shows a simple "For {name}" line */
		forName?: string;
		/** confirmed/claim cards show the sender's message in italics */
		message?: string;
		fromName?: string;
	} = $props();

	const d = $derived(cardDesign(designId));
</script>

<div
	class="gift-card"
	style="background:{d.bg};box-shadow:0 12px 28px {d.shadow}"
>
	<div class="band" style={d.band}></div>
	<div class="top">
		<div class="label">{label ?? d.label}</div>
		<div class="btc-mark">₿</div>
	</div>
	<div class="amount">{usdDisplay}</div>
	<div class="sub">≈ {btcStr} BTC · real bitcoin inside</div>
	{#if forName}
		<div class="for">For {forName}</div>
	{:else if message}
		<div class="message">“{message}”{#if fromName} — {fromName}{/if}</div>
	{/if}
</div>

<style>
	.gift-card {
		position: relative;
		overflow: hidden;
		border-radius: 18px;
		padding: 24px;
		color: #fff;
		width: 100%;
		max-width: 420px;
		aspect-ratio: 1.586 / 1;
		display: flex;
		flex-direction: column;
	}
	.band {
		pointer-events: none;
	}
	.top {
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		opacity: 0.85;
	}
	.btc-mark {
		font-weight: 700;
		font-size: 18px;
		opacity: 0.95;
	}
	.amount {
		position: relative;
		font-family: var(--font-head);
		font-size: 36px;
		font-weight: 600;
		margin: auto 0 2px;
		padding-top: 18px;
	}
	.sub {
		position: relative;
		font-size: 13px;
		opacity: 0.8;
	}
	.for {
		position: relative;
		font-size: 13px;
		opacity: 0.9;
		margin-top: 14px;
		font-weight: 500;
	}
	.message {
		position: relative;
		font-size: 13.5px;
		opacity: 0.92;
		margin-top: 14px;
		line-height: 1.45;
		font-style: italic;
	}
</style>
