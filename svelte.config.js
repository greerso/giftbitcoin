import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// Named 200.html so the SPA fallback does not overwrite the prerendered
			// home (index.html); nginx serves it as the catch-all for deep links.
			fallback: '200.html',
			precompress: false,
			strict: true
		}),
		// SPEC §5.4/§13: strict CSP. Hash mode lets SvelteKit fingerprint its own
		// inline bootstrap <script> so script-src stays 'self' (no unsafe-inline).
		// connect-src is the indexer allowlist — mempool.space serves both the BTC
		// price and the testnet4 Esplora API.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'font-src': ['self'],
				'connect-src': ['self', 'https://mempool.space'],
				'object-src': ['none'],
				'base-uri': ['none'],
				'form-action': ['none']
			}
		},
		alias: {
			$lib: 'src/lib',
			$config: 'src/config'
		}
	}
};

export default config;
