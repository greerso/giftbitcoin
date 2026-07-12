<script lang="ts">
	/**
	 * Chromium install prompt. iOS has no beforeinstallprompt — users use
	 * Share → Add to Home Screen (already covered by apple meta tags).
	 * Never runs in already-installed standalone.
	 */
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	type BIPEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	const DISMISS_KEY = 'gb-install-dismissed';

	let deferred = $state<BIPEvent | null>(null);
	let show = $state(false);

	onMount(() => {
		if (!browser) return;
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			// iOS Safari
			('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
		if (standalone) return;
		if (localStorage.getItem(DISMISS_KEY) === '1') return;

		const onBip = (e: Event) => {
			e.preventDefault();
			deferred = e as BIPEvent;
			show = true;
		};
		window.addEventListener('beforeinstallprompt', onBip);
		return () => window.removeEventListener('beforeinstallprompt', onBip);
	});

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		try {
			await deferred.userChoice;
		} catch {
			/* ignore */
		}
		deferred = null;
		show = false;
	}

	function dismiss() {
		show = false;
		deferred = null;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* private mode */
		}
	}
</script>

{#if show}
	<div class="install-bar" role="region" aria-label="Install app">
		<div class="install-copy">
			<strong>Install Gift Bitcoin</strong>
			<span>Add to your home screen for quicker gifting.</span>
		</div>
		<div class="install-actions">
			<button type="button" class="install-go" onclick={install}>Install</button>
			<button type="button" class="install-x" onclick={dismiss} aria-label="Dismiss">Not now</button>
		</div>
	</div>
{/if}

<style>
	.install-bar {
		position: sticky;
		bottom: 0;
		z-index: 40;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0;
		padding: 12px 16px;
		background: #fff;
		border-top: 1px solid var(--border-strong);
		box-shadow: 0 -6px 20px rgba(35, 39, 46, 0.06);
	}
	.install-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.install-copy strong {
		font-size: 14px;
		color: var(--ink);
	}
	.install-copy span {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.35;
	}
	.install-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
	}
	.install-go {
		border: none;
		border-radius: 10px;
		background: var(--amber);
		color: #fff;
		font: inherit;
		font-weight: 600;
		font-size: 13.5px;
		padding: 10px 14px;
		cursor: pointer;
	}
	.install-go:hover {
		background: var(--amber-hover);
	}
	.install-x {
		border: none;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		padding: 10px 8px;
		cursor: pointer;
	}
	.install-x:hover {
		color: var(--ink);
	}
</style>
