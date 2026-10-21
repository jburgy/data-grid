import { expect, test } from '@playwright/test';

// The dev server isolates every page, which would hide a quiet dependency on
// it, so the fixture is served without COOP/COEP (see beforeEach).

const FIXTURE = 'e2e/fixture-sahpool.html';
const FIELDS = { state: 'TEXT', value: 'REAL' };
const ROWS = [['NY', 1], ['NJ', 2], ["O'Brien", 4]];

const ready = page => page.waitForFunction(
    () => document.querySelector('data-grid')?.dbId !== undefined,
);

// Axes are discovered from the schema just after dbId is set.
const states = async (page) => {
    await page.waitForSelector('[data-name="state"]', { state: 'attached' });
    return page.evaluate(async () => {
        const box = await document.querySelector('[data-name="state"]').valueList();
        return [...box.querySelectorAll('[slot=filter-item] .value')].map(node => node.textContent);
    });
};

test.beforeEach(async ({ page, context }) => {
    await context.route('**/fixture-sahpool.html', async (route) => {
        const response = await route.fetch();
        const headers = Object.fromEntries(Object.entries(response.headers())
            .filter(([name]) => !name.startsWith('cross-origin-')));
        await route.fulfill({ response, headers });
    });
    await page.goto(FIXTURE);
    await ready(page);
});

test('persists in OPFS without cross-origin isolation, across reloads', async ({ page }) => {
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('undefined');

    await page.evaluate(async ({ fields, rows }) => {
        const grid = document.querySelector('data-grid');
        await grid.createTable(fields);
        await grid.bulkInsert(Object.keys(fields), rows);
        await grid.refresh();
    }, { fields: FIELDS, rows: ROWS });
    expect(await states(page)).toEqual(['NJ', 'NY', "O'Brien"]);

    // The old worker may still hold the pool; the new one has to wait for it.
    await page.reload();
    await ready(page);
    expect(await states(page)).toEqual(['NJ', 'NY', "O'Brien"]);
});

test('a second tab fails cleanly and leaves the data alone', async ({ page, context }) => {
    await page.evaluate(async ({ fields, rows }) => {
        const grid = document.querySelector('data-grid');
        await grid.createTable(fields);
        await grid.bulkInsert(Object.keys(fields), rows);
    }, { fields: FIELDS, rows: ROWS });

    const other = await context.newPage();
    const failure = new Promise(resolve => other.on('pageerror', error => resolve(error.message)));
    await other.goto(FIXTURE);
    expect(await failure).toContain('in use by another tab');
    await other.close();

    // A failed install used to be able to wipe the pool directory.
    await page.evaluate(() => document.querySelector('data-grid').refresh());
    expect(await states(page)).toEqual(['NJ', 'NY', "O'Brien"]);
    await page.reload();
    await ready(page);
    expect(await states(page)).toEqual(['NJ', 'NY', "O'Brien"]);
});

test('opens more databases than the default pool holds', async ({ page }) => {
    // The stock pool has 6 files and a writing database needs two of them.
    const results = await page.evaluate(async () => {
        const opened = [];
        for (let i = 0; i < 8; i++) {
            const grid = document.createElement('data-grid');
            grid.dataset.name = 'violations';
            grid.dataset.dbName = `capacity${i}`;
            grid.dataset.vfs = 'opfs-sahpool';
            document.body.append(grid);
            while (grid.dbId === undefined) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            await grid.createTable({ state: 'TEXT', value: 'REAL' });
            await grid.bulkInsert(['state', 'value'], [['NY', 1]]);
            opened.push(i);
        }
        return opened;
    });
    expect(results).toHaveLength(8);
});

test('retries once the other tab lets go', async ({ page, context }) => {
    const other = await context.newPage();
    const failure = new Promise(resolve => other.on('pageerror', error => resolve(error.message)));
    await other.goto(FIXTURE);
    expect(await failure).toContain('in use by another tab');

    await page.close();
    const dbId = await other.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        await grid.initialize();
        return grid.dbId;
    });
    expect(dbId).toMatch(/^sahpool:/);
});

test('shares one connection between overlapping initialize calls', async ({ page }) => {
    const opens = await page.evaluate(async () => {
        const sent = [];
        const { postMessage } = Worker.prototype;
        Worker.prototype.postMessage = function (message, ...rest) {
            if (message?.type === 'open') {
                sent.push(message.args.filename);
            }
            return postMessage.call(this, message, ...rest);
        };

        const grid = document.createElement('data-grid');
        grid.dataset.name = 'violations';
        grid.dataset.dbName = 'overlap';
        grid.dataset.vfs = 'opfs-sahpool';
        document.body.append(grid); // connectedCallback is the first caller
        await Promise.all([grid.initialize(), grid.initialize()]);

        Worker.prototype.postMessage = postMessage;
        return sent.filter(name => name === '/overlap.sqlite3');
    });
    expect(opens).toEqual(['/overlap.sqlite3']);
});
