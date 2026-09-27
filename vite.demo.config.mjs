import { cp, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const outDir = resolve(import.meta.dirname, 'dist-demo');
const widgetDir = resolve(import.meta.dirname, 'src/data_grid/static');

// The demo is a separate build from the widget bundle so that the wheel does
// not have to carry a second copy of sqlite-wasm.
export default defineConfig({
    root: resolve(import.meta.dirname, 'examples'),
    base: '/data-grid/',
    build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: resolve(import.meta.dirname, 'examples/pyscript.html') },
    },
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    plugins: [{
        name: 'demo-as-index',
        closeBundle: async () => {
            await rename(resolve(outDir, 'pyscript.html'), resolve(outDir, 'index.html'));
            // /data-grid/widget.mjs is a published URL that anywidget's `_esm`
            // can point at, so keep serving it alongside the demo.
            await cp(widgetDir, outDir, { recursive: true });
        },
    }],
});
