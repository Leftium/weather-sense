import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import ggPlugins from '@leftium/gg/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			inspector: {
				toggleKeyCombo: 'control-shift',
				showToggleButton: 'always',
				toggleButtonPos: 'bottom-right',
			},
		}),
		devtoolsJson(),
		...ggPlugins(),
	],
	css: {
		preprocessorOptions: {
			scss: {
				silenceDeprecations: ['if-function'],
			},
		},
	},
});
