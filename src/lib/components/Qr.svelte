<script lang="ts">
	import encodeQR from 'qr';

	let { data, label = '' }: { data: string; label?: string } = $props();
	// ecc 'low' keeps the module count down for ~1.6-1.9 KB three-segment payloads —
	// density is the scannability constraint, not damage tolerance, on a screen.
	const svg = $derived(encodeQR(data, 'svg', { ecc: 'low', border: 2 }));
</script>

<div class="qr-box" role="img" aria-label={label || 'QR code'}>
	{@html svg}
</div>

<style>
	.qr-box {
		background: #fff;
		border-radius: 10px;
		padding: 6px;
		line-height: 0;
	}
	.qr-box :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
