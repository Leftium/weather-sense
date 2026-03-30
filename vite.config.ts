import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import ggPlugins from '@leftium/gg/vite';

/**
 * Workaround for Vite 8 pre-bundling stripping @vite-ignore comments.
 *
 * @leftium/gg's runtime uses a dynamic import of a virtual module
 * (`virtual:gg-file-sink-sender`) with `@vite-ignore`. Vite 8's esbuild
 * pre-bundler strips the comment, causing vite:import-analysis to reject
 * the `/@id/virtual:...` URL in the pre-bundled chunk.
 *
 * This plugin resolves that URL so import-analysis accepts it.
 */
function ggVirtualModuleFix(): Plugin {
	return {
		name: 'gg-virtual-module-fix',
		enforce: 'pre',
		resolveId(id) {
			if (id === '/@id/virtual:gg-file-sink-sender') {
				return '\0virtual:gg-file-sink-sender';
			}
		},
	};
}

export default defineConfig({
	plugins: [sveltekit(), devtoolsJson(), ggVirtualModuleFix(), ...ggPlugins()],
	css: {
		preprocessorOptions: {
			scss: {
				silenceDeprecations: ['if-function'],
			},
		},
	},
});
