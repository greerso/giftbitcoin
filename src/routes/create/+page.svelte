<script lang="ts">
	import { createGift } from '$lib/crypto/create-gift';
	import { DEFAULT_TIP_FRACTION, MIN_GIFT_SATS, T_PRESETS } from '$config/network';
	import * as btc from '@scure/btc-signer';

	let amountSats = $state(MIN_GIFT_SATS);
	let tipPercent = $state(DEFAULT_TIP_FRACTION * 100);
	let tipSats = $state(Math.floor(MIN_GIFT_SATS * DEFAULT_TIP_FRACTION));
	let T = $state(T_PRESETS.days90);
	let passphrase = $state('');
	let busy = $state(false);
	let error = $state('');
	let result = $state<{
		address: string;
		descriptor: string;
		claimSecretHex: string;
		refundSecretHex?: string;
		shareJson: string;
		backupJson: string;
	} | null>(null);

	function syncTipFromPercent() {
		tipSats = Math.floor(amountSats * (tipPercent / 100));
	}
	function syncTipFromSats() {
		tipPercent = amountSats > 0 ? (tipSats / amountSats) * 100 : 0;
	}

	$effect(() => {
		// keep tip sats in sync when amount changes if user left default-ish tip
		void amountSats;
	});

	async function onCreate() {
		error = '';
		result = null;
		if (amountSats < MIN_GIFT_SATS) {
			error = `Minimum gift is ${MIN_GIFT_SATS} sats (testnet UX floor).`;
			return;
		}
		busy = true;
		try {
			const gift = await createGift({
				T,
				policy: 'refund_self',
				passphrase: passphrase || undefined,
				network: btc.TEST_NETWORK
			});
			const share = {
				v: 1,
				network: 'testnet4',
				script: {
					address: gift.payment.address,
					C_xonly: gift.payment.C_xonly,
					R_xonly: gift.payment.R_xonly,
					T: gift.T,
					nums_xonly: gift.payment.nums_xonly,
					script_pub_key: gift.payment.scriptPubKeyHex,
					descriptor: gift.descriptor
				},
				claim: {
					secret_hex: gift.claimSecretHex,
					passphrase_required: gift.passphraseRequired,
					kdf: gift.kdf
				},
				expiry_policy: { type: gift.policy, T_blocks: gift.T },
				amount_expected_sats: amountSats,
				tip_sats_suggested: tipSats
			};
			const backup = {
				...share,
				refund: gift.refundSecretHex
					? { secret_hex: gift.refundSecretHex, kdf: { name: 'hkdf-sha256', info: 'btcgiftcard/v1/refund' } }
					: undefined
			};
			result = {
				address: gift.payment.address,
				descriptor: gift.descriptor,
				claimSecretHex: gift.claimSecretHex,
				refundSecretHex: gift.refundSecretHex,
				shareJson: JSON.stringify(share, null, 2),
				backupJson: JSON.stringify(backup, null, 2)
			};
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function download(filename: string, text: string) {
		const blob = new Blob([text], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function claimUrl(): string {
		if (!result) return '';
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		return `${base}/c#v1.${result.claimSecretHex}`;
	}
</script>

<h1>Create gift</h1>
<p>Keys are generated in your browser. Save the backup — we cannot restore a lost link.</p>

<label>
	Gift amount (sats)
	<input type="number" bind:value={amountSats} min={MIN_GIFT_SATS} step="1000" onchange={syncTipFromPercent} />
</label>

<label>
	Project tip (%)
	<input type="number" bind:value={tipPercent} min="0" max="100" step="0.1" onchange={syncTipFromPercent} />
</label>
<label>
	Project tip (sats) — editable; set 0 for no tip
	<input type="number" bind:value={tipSats} min="0" step="1" onchange={syncTipFromSats} />
</label>
<p class="hint">Default 3%. Separate from the gift vault. Optional support for the project.</p>

<label>
	Expiry (blocks)
	<select bind:value={T}>
		<option value={T_PRESETS.days30}>~30 days ({T_PRESETS.days30})</option>
		<option value={T_PRESETS.days90}>~90 days ({T_PRESETS.days90})</option>
		<option value={T_PRESETS.days180}>~180 days ({T_PRESETS.days180})</option>
	</select>
</label>

<label>
	Optional claim passphrase (second factor)
	<input type="password" bind:value={passphrase} autocomplete="new-password" />
</label>

<button type="button" class="primary" disabled={busy} onclick={onCreate}>
	{busy ? 'Generating…' : 'Generate gift address'}
</button>

{#if error}
	<p class="err">{error}</p>
{/if}

{#if result}
	<section class="card">
		<h2>Fund this address (testnet)</h2>
		<p class="mono">{result.address}</p>
		<p>Send at least <strong>{amountSats}</strong> sats (testnet). Wait for 1 confirmation before sharing.</p>
		<p class="hint">Funding / buy-BTC on-ramp: coming soon (stub). Use a testnet faucet for now.</p>

		<h3>Claim link (bearer — treat like cash)</h3>
		<p class="mono small">{claimUrl()}</p>

		<div class="row">
			<button type="button" onclick={() => download('share_card.json', result!.shareJson)}>
				Download share card
			</button>
			<button type="button" onclick={() => download('sender_full_backup.json', result!.backupJson)}>
				Download full backup
			</button>
		</div>
		<p class="warn">Download the full backup now if you want a refund path after expiry.</p>
	</section>
{/if}

<style>
	label {
		display: block;
		margin: 1rem 0 0.5rem;
		font-weight: 600;
	}
	input,
	select {
		display: block;
		width: 100%;
		margin-top: 0.35rem;
		padding: 0.5rem;
		box-sizing: border-box;
		font: inherit;
	}
	button {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		font: inherit;
		font-weight: 600;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		background: #e2e8f0;
	}
	button.primary {
		background: #f59e0b;
	}
	.hint {
		font-size: 0.85rem;
		color: #64748b;
	}
	.err {
		color: #b91c1c;
	}
	.card {
		margin-top: 2rem;
		padding: 1rem;
		background: #fff;
		border-radius: 0.5rem;
		border: 1px solid #cbd5e1;
	}
	.mono {
		font-family: ui-monospace, monospace;
		word-break: break-all;
		font-size: 0.95rem;
	}
	.mono.small {
		font-size: 0.8rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.warn {
		color: #b45309;
		font-weight: 600;
	}
</style>
