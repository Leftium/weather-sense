import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import ggPlugins from '@leftium/gg/vite';

export default defineConfig({
	plugins: [sveltekit(), devtoolsJson(), ...ggPlugins()],
	css: {
		preprocessorOptions: {
			scss: {
				silenceDeprecations: ['if-function'],
			},
		},
	},
});
