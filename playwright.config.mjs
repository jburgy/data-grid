import { defineConfig, devices } from '@playwright/test';

const PORT = 5174; // not 5173, so a dev server you already have open is left alone
const baseURL = `http://localhost:${PORT}/data-grid/`;

export default defineConfig({
    testDir: 'e2e',
    // The suite shares one OPFS database, so keep it sequential.
    workers: 1,
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    reporter: 'list',
    use: { baseURL, trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
    webServer: {
        // sqlite-wasm reaches OPFS through SharedArrayBuffer, so the page has to
        // be cross-origin isolated; vite.config.mjs already sends COOP/COEP.
        command: `npx vite --port ${PORT} --strictPort`,
        url: `${baseURL}e2e/fixture.html`,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
    },
});
