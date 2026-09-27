import { defineConfig, devices } from '@playwright/test';

const PORT = 5174; // not 5173, so a dev server you already have open is left alone
const DEMO_PORT = 5176;
const baseURL = `http://localhost:${PORT}/data-grid/`;
const demoURL = `http://localhost:${DEMO_PORT}/data-grid/`;

export default defineConfig({
    testDir: 'e2e',
    // The suite shares one OPFS database, so keep it sequential.
    workers: 1,
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    reporter: 'list',
    use: { trace: 'retain-on-failure' },
    projects: [
        {
            name: 'chromium',
            testIgnore: 'pyscript.spec.mjs',
            use: { ...devices['Desktop Chrome'], baseURL },
        },
        {
            // Served by `vite preview`, which sends no COOP/COEP -- the demo is
            // built to work without them, as GitHub Pages does.
            name: 'demo',
            testMatch: 'pyscript.spec.mjs',
            use: { ...devices['Desktop Chrome'], baseURL: demoURL },
        },
    ],
    webServer: [
        {
            // sqlite-wasm reaches OPFS through SharedArrayBuffer, so the page has to
            // be cross-origin isolated; vite.config.mjs already sends COOP/COEP.
            command: `npx vite --port ${PORT} --strictPort`,
            url: `${baseURL}e2e/fixture.html`,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
        },
        {
            command: `npx vite preview --config vite.demo.config.mjs --port ${DEMO_PORT} --strictPort`,
            url: demoURL,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
        },
    ],
});
