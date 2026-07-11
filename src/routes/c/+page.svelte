<script lang="ts">
	import { onMount } from 'svelte';
	import {
		claimPrivFromSecret,
		claimPrivFromPassphrase,
		hexToBytesStrict,
		bytesToHex,
		xOnlyFromPriv
	} from '$lib/crypto/keys';

	let status = $state('Open a claim link (…/c#v1.…secret) or paste a share card later.');
	let secretHex = $state('');
	let passphrase = $state('');
	let passphraseRequired = $state(false);
	let C_hex = $state('');
	let error = $state('');

	onMount(() => {
		const hash = window.location.hash.replace(/^#/, '');
		if (hash.startsWith('v1.p.')) {
			passphraseRequired = true;
			secretHex = hash.slice('v1.p.'.length);
			status = 'Passphrase required. Enter it to continue.';
		} else if (hash.startsWith('v1.')) {
			secretHex = hash.slice('v1.'.length);
			status = 'Claim secret loaded from link. Destination chooser coming next — crypto path works.';
			tryDerive();
		}
	});

	async function tryDerive() {
		error = '';
		C_hex = '';
		try {
			const secret = hexToBytesStrict(secretHex);
			const priv = passphraseRequired
				? await claimPrivFromPassphrase(secret, passphrase)
				: claimPrivFromSecret(secret);
			C_hex = bytesToHex(xOnlyFromPriv(priv));
			status = 'Claim key derived in-browser (never sent to a server). Full claim UI next.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<h1>Claim gift</h1>
<p class="banner-note">Where should we send it? Full destination chooser (Phoenix, exchanges, …) ships next.</p>

<p>{status}</p>

{#if passphraseRequired}
	<label>
		Passphrase
		<input type="password" bind:value={passphrase} />
	</label>
	<button type="button" onclick={tryDerive}>Unlock</button>
{/if}

{#if C_hex}
	<p class="mono">Claim pubkey C (x-only): {C_hex}</p>
{/if}

{#if error}
	<p class="err">{error}</p>
{/if}

<p class="hint">
	We never ask for exchange passwords. You will paste a Bitcoin deposit address from Coinbase,
	Gemini, Kraken, Phoenix, or any wallet.
</p>

<style>
	.banner-note {
		font-weight: 600;
		color: #0f172a;
	}
	.mono {
		font-family: ui-monospace, monospace;
		word-break: break-all;
		font-size: 0.85rem;
	}
	.err {
		color: #b91c1c;
	}
	.hint {
		margin-top: 2rem;
		color: #64748b;
		font-size: 0.9rem;
	}
	label {
		display: block;
		margin: 1rem 0;
		font-weight: 600;
	}
	input {
		display: block;
		width: 100%;
		margin-top: 0.35rem;
		padding: 0.5rem;
		box-sizing: border-box;
	}
	button {
		padding: 0.75rem 1rem;
		font: inherit;
		font-weight: 600;
		border: none;
		border-radius: 0.5rem;
		background: #f59e0b;
		cursor: pointer;
	}
</style>
