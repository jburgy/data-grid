import { defineConfig } from 'vite';

// Kept separate from vite.config.mjs so vitest does not also collect the
// Playwright specs under e2e/, which only run in a browser.
export default defineConfig({
    test: {
        include: ['test/**/*.test.mjs'],
    },
});
