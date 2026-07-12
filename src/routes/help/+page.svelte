<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { setNav, clearNav } from '$lib/nav.svelte';

	onMount(() => setNav(() => goto('/')));
	onDestroy(clearNav);

	const faqs = [
		{
			q: 'What is this?',
			a: 'Someone gave you real bitcoin. The gift link is what controls it — like cash in an envelope.'
		},
		{
			q: 'Which option should I pick?',
			a: 'On a phone with nothing set up: Phoenix, a free wallet app. Already use Coinbase or Kraken? Use your exchange. Know your way around? Paste any address.'
		},
		{
			q: 'Is this safe?',
			a: 'The link is like cash — keep it private. This site never holds the bitcoin or your keys.'
		},
		{
			q: 'What if I lose the link?',
			a: 'It can’t be recovered — by anyone. That’s what makes it truly yours. Download the backup when offered.'
		}
	];
</script>

<h2 class="h2">Quick help</h2>
<div class="faq">
	{#each faqs as f}
		<div class="card">
			<div class="q">{f.q}</div>
			<div class="a">{f.a}</div>
		</div>
	{/each}
</div>
<button class="btn btn-primary mt" onclick={() => goto('/c')}>Redeem a gift</button>

<style>
	.faq {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.q {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.a {
		font-size: 14px;
		line-height: 1.55;
		color: var(--muted);
	}
	.mt {
		margin-top: 24px;
	}
</style>
