<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Gift Bitcoin (testnet) · giftbitcoin.app</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="app">
	<header class="banner">Bitcoin testnet4 only — no real value</header>
	<nav>
		<a href="/">Home</a>
		<a href="/create">Create</a>
		<a href="/c">Claim</a>
		<a href="/recover">Recover</a>
		<a href="/help">Help</a>
	</nav>
	<main>
		{@render children()}
	</main>
	<footer>
		<p>
			Gift Bitcoin (giftbitcoin.app, Bitcoin testnet4) is non-custodial software. Share packages and
			claim links are bearer instruments. The website cannot reverse transactions or restore lost
			links. Optional project tip is separate from the gift vault.
		</p>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		line-height: 1.5;
		color: #0f172a;
		background: #f8fafc;
	}
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.banner {
		background: #b45309;
		color: #fff;
		text-align: center;
		padding: 0.5rem 1rem;
		font-weight: 600;
		font-size: 0.9rem;
	}
	nav {
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		background: #0f172a;
	}
	nav a {
		color: #e2e8f0;
		text-decoration: none;
		font-weight: 500;
	}
	nav a:hover {
		color: #fff;
	}
	main {
		flex: 1;
		max-width: 40rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		width: 100%;
		box-sizing: border-box;
	}
	footer {
		padding: 1rem 1.25rem;
		background: #e2e8f0;
		font-size: 0.8rem;
		color: #475569;
	}
	footer p {
		max-width: 40rem;
		margin: 0 auto;
	}
</style>
