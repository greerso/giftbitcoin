<script lang="ts">
</script>

<h1>Gift Bitcoin</h1>
<p class="domain">giftbitcoin.app</p>
<p class="lede">
	Send Bitcoin as a gift link. The recipient claims to any wallet — including Coinbase, Gemini,
	Kraken, or a self-custody app — without you knowing their address first.
</p>
<p>
	<strong>Non-custodial:</strong> keys are created in your browser. The website never holds spend
	keys. Gifts sit in a Taproot script until claimed or refunded after a timeout.
</p>
<ul class="actions">
	<li><a class="btn primary" href="/create">Create a gift</a></li>
	<li><a class="btn" href="/c">Claim a gift</a></li>
	<li><a class="btn" href="/recover">Recover unclaimed</a></li>
</ul>
<p class="note">Testnet only. Use testnet coins from a faucet — not real Bitcoin.</p>

<style>
	h1 {
		font-size: 1.75rem;
		margin: 0 0 0.25rem;
	}
	.domain {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		color: #64748b;
		font-weight: 600;
	}
	.lede {
		font-size: 1.1rem;
		color: #334155;
	}
	.actions {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 2rem 0;
	}
	.btn {
		display: block;
		text-align: center;
		padding: 0.85rem 1rem;
		border-radius: 0.5rem;
		background: #e2e8f0;
		color: #0f172a;
		text-decoration: none;
		font-weight: 600;
	}
	.btn.primary {
		background: #f59e0b;
		color: #0f172a;
	}
	.note {
		font-size: 0.9rem;
		color: #64748b;
	}
</style>
