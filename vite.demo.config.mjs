import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const outDir = resolve(import.meta.dirname, 'dist-demo');

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
        closeBundle: () => rename(resolve(outDir, 'pyscript.html'), resolve(outDir, 'index.html')),
    }],
});
