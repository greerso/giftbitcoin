<script lang="ts">
	import '$lib/styles/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { nav } from '$lib/nav.svelte';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Gift Bitcoin (testnet) · giftbitcoin.app</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="app">
	<div class="strip">Test mode — bitcoin on this site has no real value</div>

	<header>
		{#if nav.back}
			<button class="back" onclick={nav.back} aria-label="Back">←</button>
		{/if}
		<a class="brand" href="/">
			<span class="mark">₿</span>
			<span class="wordmark">giftbitcoin<span class="tld">.app</span></span>
		</a>
		<div class="spacer"></div>
		<nav class="top-links">
			<a href="/help">Help</a>
			<a href="/recover">Recover a gift</a>
		</nav>
	</header>

	<main>
		<div class="content">
			{#if nav.stepLabel}
				<div class="step-label">{nav.stepLabel}</div>
			{/if}
			{@render children()}
		</div>
	</main>

	<footer>
		<div class="foot-note">
			A gift link is a bearer instrument, like cash. Lost links can't be recovered by anyone.
		</div>
		<div class="foot-links">
			<a href="/help">Help</a>
			<a href="/recover">Recover</a>
		</div>
	</footer>
</div>

<style>
	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}
	.strip {
		flex: none;
		background: var(--strip-bg);
		color: var(--strip-ink);
		font-size: 11.5px;
		font-weight: 500;
		text-align: center;
		padding: 6px 12px;
		letter-spacing: 0.02em;
	}
	header {
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		border-bottom: 1px solid var(--divider);
		background: var(--surface);
	}
	.back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: #fff;
		color: var(--muted-2);
		font-size: 16px;
		cursor: pointer;
		flex: none;
		padding: 0;
	}
	.back:hover {
		background: #f3eee3;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: var(--ink);
	}
	.brand:hover {
		text-decoration: none;
	}
	.mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 20px;
		border-radius: 6px;
		background: var(--amber);
		color: #fff;
		font-weight: 700;
		font-size: 12px;
	}
	.wordmark {
		font-family: var(--font-head);
		font-weight: 600;
		font-size: 16.5px;
		letter-spacing: -0.01em;
	}
	.tld {
		color: var(--tan);
		font-weight: 500;
	}
	.spacer {
		flex: 1;
	}
	.top-links {
		display: none;
		gap: 22px;
		font-size: 14px;
		font-weight: 500;
	}
	.top-links a {
		color: var(--muted);
	}
	.top-links a:hover {
		color: var(--ink);
		text-decoration: none;
	}
	main {
		flex: 1;
		overflow-y: auto;
	}
	.content {
		max-width: 560px;
		margin: 0 auto;
		padding: 28px 20px 48px;
		width: 100%;
	}
	footer {
		flex: none;
		border-top: 1px solid var(--divider);
		padding: 12px 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		background: var(--surface);
	}
	.foot-note {
		font-size: 11px;
		color: var(--tan);
		line-height: 1.45;
		max-width: 70%;
	}
	.foot-links {
		display: flex;
		gap: 14px;
		font-size: 12px;
		font-weight: 600;
		flex: none;
	}
	.foot-links a {
		color: var(--muted);
	}
	.foot-links a:hover {
		color: var(--ink);
		text-decoration: none;
	}
	@media (min-width: 720px) {
		.top-links {
			display: flex;
		}
	}
</style>
