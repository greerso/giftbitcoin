<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { clearNav } from '$lib/nav.svelte';

	onMount(clearNav);

	const bullets = [
		{ h: 'Non-custodial.', t: 'The bitcoin lives at an address only your gift link controls — we never hold keys.' },
		{ h: 'No account needed.', t: 'Not for you, not for them.' },
		{
			h: 'Redeem to your own wallet.',
			t: "We'll help you set one up, or use an exchange like Coinbase if you'd rather."
		}
	];
</script>

<div class="home">
	<div class="hero-mark">₿</div>
	<div class="eyebrow">E-gift card · real bitcoin</div>
	<h1>The e-gift card that's real bitcoin.</h1>
	<p class="hero-lede">
		A digital gift card you send by link, with nothing to mail. Pick a design, choose an amount in
		dollars, and share it. They redeem it to a wallet they control. No accounts, and we never touch
		the money.
	</p>
	<div class="cta">
		<button class="btn btn-primary" onclick={() => goto('/create')}>Create a gift card</button>
		<button class="btn btn-secondary" onclick={() => goto('/c')}>Redeem a gift card</button>
	</div>
	<div class="bullets">
		{#each bullets as b}
			<div class="bullet">
				<div class="dot"></div>
				<div class="bt"><strong>{b.h}</strong> {b.t}</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.hero-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 92px;
		height: 60px;
		border-radius: 14px;
		background: linear-gradient(135deg, var(--amber-grad-a), var(--amber-grad-b));
		color: #fff;
		font-weight: 700;
		font-size: 26px;
		box-shadow: 0 8px 20px rgba(201, 114, 16, 0.28);
		margin-bottom: 18px;
	}
	.eyebrow {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--warn-ink);
		background: var(--warn-bg);
		border-radius: 999px;
		padding: 5px 10px;
		margin-bottom: 12px;
	}
	h1 {
		font-size: 32px;
		line-height: 1.15;
		letter-spacing: -0.02em;
		margin: 0 0 12px;
	}
	.hero-lede {
		font-size: 16px;
		line-height: 1.6;
		color: var(--muted);
		margin: 0 0 26px;
		text-wrap: pretty;
	}
	.cta {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 34px;
	}
	.btn-secondary {
		padding: 14px;
	}
	.bullets {
		display: flex;
		flex-direction: column;
		gap: 14px;
		border-top: 1px solid var(--divider);
		padding-top: 22px;
	}
	.bullet {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--amber);
		margin-top: 6px;
	}
	.bt {
		font-size: 14px;
		line-height: 1.5;
		color: var(--muted-2);
	}
	.bt strong {
		color: var(--ink);
	}
	@media (min-width: 720px) {
		h1 {
			font-size: 40px;
		}
	}
</style>
