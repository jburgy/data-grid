import { rmSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

// The other specs run against the dev server. This one loads the built
// widget.mjs the way Jupyter does, because a production bundle has to find
// sqlite3.wasm and the OPFS proxy worker as emitted files.

const PAGE = `<!doctype html><body><script type="module">
import widget from '/data-grid/widget.mjs';
const vfs = new URLSearchParams(location.search).get('vfs');
const model = {
    get: key => ({ table: 'violations', db: 'built-' + vfs, source: '' })[key] ?? [],
    on() {}, set() {}, save_changes() {},
};
widget.render({ model, el: { appendChild(node) { node.dataset.vfs = vfs; document.body.append(node); } } });
</script></body>`;

const VFSES = ['opfs', 'opfs-sahpool', 'memdb'];

// A real file, not page.route(): intercepting requests changes how Chromium
// loads the data: URL worker that a library-mode build produces, which hid the
// very failure this spec is for.
const pageFile = new URL('../dist-demo/widget-test.html', import.meta.url);
test.beforeAll(() => writeFileSync(pageFile, PAGE));
test.afterAll(() => rmSync(pageFile, { force: true }));

for (const vfs of VFSES) {
    test(`opens ${vfs} from the built widget`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        await page.goto(`widget-test.html?vfs=${vfs}`);
        expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
        await page.waitForFunction(() => document.querySelector('data-grid')?.dbId !== undefined);

        const columns = await page.evaluate(async () => {
            const grid = document.querySelector('data-grid');
            await grid.createTable({ state: 'TEXT', value: 'REAL' });
            await grid.bulkInsert(['state', 'value'], [['NY', 1], ['NJ', 2]]);
            return grid.columns();
        });
        expect(columns).toEqual([{ name: 'state', type: 'TEXT' }, { name: 'value', type: 'REAL' }]);
        expect(errors).toEqual([]);
    });
}
