import { defineConfig } from "vite";
import anywidget from "@anywidget/vite";

export default defineConfig({
	build: {
		outDir: "src/data_grid/static",
		lib: {
			entry: ["js/widget.js"],
			formats: ["es"],
		},
	},
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
	plugins: [anywidget()],
	server: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
		proxy: {
			'/api': {
				target: 'http://localhost:8888',
				ws: true,
			},
			'/kernelspecs': 'http://localhost:8888',
			'/lab': 'http://localhost:8888',
			'/lsp': 'http://localhost:8888',
			'/static': 'http://localhost:8888',
		},
	},
});