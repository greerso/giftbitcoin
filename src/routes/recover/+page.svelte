<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { setNav, clearNav } from '$lib/nav.svelte';
	import { parseShareCardFragment } from '$lib/gift-package';
	import { getUtxos, confirmedValue, hasMempool } from '$lib/esplora';
	import { fmtBtc } from '$lib/format';
	import { satsToBtc } from '$lib/pricing';

	onMount(() => setNav(() => goto('/')));
	onDestroy(clearNav);

	let input = $state('');
	let showAdv = $state(false);
	let checking = $state(false);
	let result = $state<{ funded: boolean; sats: number; pending: boolean; address: string } | null>(null);
	let error = $state('');

	function extractAddress(raw: string): string | null {
		const text = raw.trim();
		// full gift link (…#g1.<b64>)
		const hashIdx = text.indexOf('#');
		if (hashIdx >= 0) {
			try {
				const sc = parseShareCardFragment(text.slice(hashIdx + 1)) as any;
				if (sc?.script?.address) return sc.script.address;
			} catch {
				/* not a fragment */
			}
		}
		// pasted backup / share_card JSON
		try {
			const obj = JSON.parse(text);
			if (obj?.script?.address) return obj.script.address;
		} catch {
			/* not JSON */
		}
		return null;
	}

	async function check() {
		error = '';
		result = null;
		const address = extractAddress(input);
		if (!address) {
			error = 'Paste the full gift link, or open your backup file and paste its contents.';
			return;
		}
		checking = true;
		try {
			const utxos = await getUtxos(address);
			result = {
				address,
				sats: confirmedValue(utxos),
				funded: confirmedValue(utxos) > 0,
				pending: hasMempool(utxos)
			};
		} catch (e) {
			error = 'Could not reach the chain indexer: ' + (e instanceof Error ? e.message : String(e));
		} finally {
			checking = false;
		}
	}
</script>

<h2 class="h2">Recover an unredeemed gift</h2>
<p class="lede">
	If your gift card wasn’t redeemed before it expired, you can send the bitcoin back to yourself.
	Paste your gift link or open your backup file.
</p>
<textarea bind:value={input} placeholder="https://giftbitcoin.app/c#…  (or paste your backup JSON)" rows="3" class="mono"></textarea>
{#if error}<p class="err">{error}</p>{/if}
<button class="btn btn-primary mt" disabled={checking} onclick={check}>
	{checking ? 'Checking…' : 'Check status'}
</button>

{#if result}
	<div class="info-box mt">
		{#if result.funded}
			This gift holds <strong>{fmtBtc(satsToBtc(result.sats))} BTC</strong> at
			<span class="mono">{result.address.slice(0, 12)}…</span>. It can still be redeemed with the gift
			link. Reclaiming to your own wallet becomes possible after the expiry timelock matures —
			signing the refund path with the key in your backup lands in a later build.
		{:else if result.pending}
			Funds are on their way but not confirmed yet. Check back once they confirm.
		{:else}
			No confirmed funds are at this gift address — it was never funded, or it has already been
			redeemed or reclaimed.
		{/if}
	</div>
{/if}

<button class="adv-toggle" onclick={() => (showAdv = !showAdv)}>Advanced {showAdv ? '▴' : '▾'}</button>
{#if showAdv}
	<p class="adv-note">
		The gift key is in your link’s fragment (#…), never sent to our servers. Your backup file also
		contains the refund secret for the expiry path. Any wallet that imports the descriptor and keys
		can spend the refund path directly once the CSV timelock matures.
	</p>
{/if}

<style>
	.mt {
		margin-top: 16px;
	}
	.err {
		color: var(--danger);
		font-size: 13.5px;
		margin-top: 8px;
	}
	.adv-toggle {
		display: inline-block;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--link);
		cursor: pointer;
		margin-top: 22px;
		background: none;
		border: none;
		padding: 0;
	}
	.adv-note {
		font-size: 13px;
		line-height: 1.6;
		color: var(--muted);
		margin-top: 10px;
		font-family: var(--font-mono);
	}
</style>
