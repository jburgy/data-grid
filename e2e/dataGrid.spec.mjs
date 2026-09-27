import { expect, test } from '@playwright/test';

/**
 * `dbId` is set by DataGrid.initialize(), so it is a race-free signal that the
 * worker is up and the database is open.
 */
async function openFixture(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(`console: ${message.text()}`);
        }
    });

    await page.goto('e2e/fixture.html');
    await page.waitForFunction(() => document.querySelector('data-grid')?.dbId !== undefined);
    return errors;
}

/** Load a fresh table and return the grid handle-free helpers below. */
async function load(page, fields, rows) {
    return page.evaluate(async ({ fields, rows }) => {
        const grid = document.querySelector('data-grid');
        await grid.createTable(fields);
        const before = rows.length;
        await grid.bulkInsert(Object.keys(fields), rows);
        return { before, after: rows.length };
    }, { fields, rows });
}

async function pivot(page, { rowAxis = [], colAxis = [] }) {
    return page.evaluate(async ({ rowAxis, colAxis }) => {
        const grid = document.querySelector('data-grid');
        grid.querySelectorAll('data-grid-axis')
            .forEach(axis => axis.setAttribute('slot', 'unused-axis'));
        rowAxis.forEach(name => grid.querySelector(`[data-name="${name}"]`).setAttribute('slot', 'row-axis'));
        colAxis.forEach(name => grid.querySelector(`[data-name="${name}"]`).setAttribute('slot', 'col-axis'));
        await grid.refresh();

        const shadow = grid.querySelector('pivot-table').shadowRoot;
        const text = row => [...row.cells].map(cell => cell.textContent.trim());
        return {
            head: [...shadow.querySelector('thead').rows].map(text),
            body: [...shadow.querySelector('tbody').rows].map(text),
            rowLabels: [...shadow.querySelectorAll('th.rowLabel')].map(node => node.textContent),
            tbodyCount: shadow.querySelectorAll('tbody').length,
            cells: [...shadow.querySelectorAll('td.val')].map(cell => ({
                text: cell.textContent,
                value: cell.getAttribute('data-value'),
            })),
        };
    }, { rowAxis, colAxis });
}

const STATES = ['NY', 'NJ', "O'Brien"]; // the apostrophe used to break the SQL
const rowsFor = (states, counties, kinds) => states.flatMap(
    (state, s) => counties.flatMap(
        (county, c) => kinds.map((kind, k) => [state, county, kind, (s + 1) * 100 + c * 10 + k]),
    ),
);

test('discovers axes from the schema and leaves the caller\'s rows alone', async ({ page }) => {
    const errors = await openFixture(page);

    const { before, after } = await load(
        page,
        { state: 'TEXT', county: 'TEXT', amount_type: 'TEXT', value: 'REAL' },
        rowsFor(STATES, ['Kings', 'Queens'], ['fine']),
    );
    expect(after).toBe(before); // bulkInsert used to splice the array empty

    const columns = await page.evaluate(() => document.querySelector('data-grid').columns());
    expect(columns).toEqual([
        { name: 'state', type: 'TEXT' },
        { name: 'county', type: 'TEXT' },
        { name: 'amount_type', type: 'TEXT' },
        { name: 'value', type: 'REAL' },
    ]);

    const names = await page.evaluate(() => [...document.querySelector('data-grid')
        .querySelectorAll('data-grid-axis')].map(axis => axis.dataset.name));
    expect(names).toEqual(['state', 'county', 'amount_type']); // REAL `value` is the measure
    expect(errors).toEqual([]);
});

test('nests row headers with the right spans', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', county: 'TEXT', amount_type: 'TEXT', value: 'REAL' },
        rowsFor(['NJ', 'NY'], ['Bronx', 'Kings'], ['fine', 'penalty']),
    );

    const { head, body, tbodyCount } = await pivot(page, {
        rowAxis: ['state', 'county'],
        colAxis: ['amount_type'],
    });

    expect(tbodyCount).toBe(1); // the template's tbody used to be joined by a second
    expect(head[0]).toEqual(['', 'amount_type', 'fine', 'penalty']);
    expect(head[1]).toEqual(['state', 'county', '']);
    // 'NJ' spans both of its county rows, so the second row omits it
    expect(body).toEqual([
        ['NJ', 'Bronx', '100', '101'],
        ['Kings', '110', '111'],
        ['NY', 'Bronx', '200', '201'],
        ['Kings', '210', '211'],
    ]);
    expect(errors).toEqual([]);
});

test('renders a value containing an apostrophe, and filters it out', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', county: 'TEXT', amount_type: 'TEXT', value: 'REAL' },
        rowsFor(STATES, ['Kings'], ['fine']),
    );

    expect((await pivot(page, { rowAxis: ['state'] })).rowLabels)
        .toEqual(['NJ', 'NY', "O'Brien"]);

    const labels = await page.evaluate(async () => {
        const axis = document.querySelector('[data-name="state"]');
        const box = await axis.valueList();
        return [...box.querySelectorAll('[slot=filter-item]')]
            .map(item => item.textContent.replace(/\s+/g, ' ').trim());
    });
    expect(labels).toEqual(["NJ (1)", "NY (1)", "O'Brien (1)"]);

    // The excluded values never reach the query, so keep the apostrophe one and
    // drop another: that is what puts `IN ('O'Brien', ...)` in front of SQLite.
    const kept = await page.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        const box = grid.querySelector('[data-name="state"] filter-box');
        box.querySelectorAll('[type=checkbox]').forEach((node) => {
            if (node.filterValue === 'NJ') {
                node.checked = false;
                node.dispatchEvent(new Event('change'));
            }
        });
        box.shadowRoot.querySelector('#apply').click();
        await grid.refresh();
        return [...grid.querySelector('pivot-table').shadowRoot
            .querySelectorAll('th.rowLabel')].map(node => node.textContent);
    });
    expect(kept).toEqual(['NY', "O'Brien"]);
    expect(errors).toEqual([]);
});

test('survives excluding every value', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', county: 'TEXT', amount_type: 'TEXT', value: 'REAL' },
        rowsFor(['NY', 'NJ'], ['Kings'], ['fine']),
    );
    await pivot(page, { rowAxis: ['state'] });

    // SQLite accepts `IN ()` as an extension, so this never threw; the point is
    // that excluding everything yields an empty table rather than everything.
    const rowLabels = await page.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        const box = await grid.querySelector('[data-name="state"]').valueList();
        box.querySelectorAll('[type=checkbox]').forEach((node) => {
            node.checked = false;
            node.dispatchEvent(new Event('change'));
        });
        box.shadowRoot.querySelector('#apply').click();
        await grid.refresh();
        return [...grid.querySelector('pivot-table').shadowRoot
            .querySelectorAll('th.rowLabel')].map(node => node.textContent);
    });
    expect(rowLabels).toEqual([]);
    expect(errors).toEqual([]);
});

test('orders a numeric axis numerically and does not duplicate it on re-open', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { precinct: 'INTEGER', amount_type: 'TEXT', value: 'REAL' },
        [10, 2, 33, 4].flatMap(precinct => ['fine', 'penalty']
            .map(kind => [precinct, kind, precinct * 10])),
    );

    const first = await page.evaluate(async () => {
        const box = await document.querySelector('[data-name="precinct"]').valueList();
        return [...box.querySelectorAll('[slot=filter-item] .value')].map(node => node.textContent);
    });
    expect(first).toEqual(['2', '4', '10', '33']); // numeric, not lexicographic

    // Re-opening used to compare a string attribute against a number, so every
    // pass appended a fresh copy of the whole list.
    const reopened = await page.evaluate(async () => {
        const axis = document.querySelector('[data-name="precinct"]');
        await axis.valueList();
        await axis.valueList();
        const box = axis.querySelector('filter-box');
        return {
            values: [...box.querySelectorAll('[slot=filter-item] .value')].map(node => node.textContent),
            types: [...box.querySelectorAll('[type=checkbox]')].map(node => typeof node.filterValue),
        };
    });
    expect(reopened.values).toEqual(['2', '4', '10', '33']);
    expect(reopened.types).toEqual(['number', 'number', 'number', 'number']);

    // A bound number still matches an INTEGER column.
    const kept = await page.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        grid.querySelector('[data-name="precinct"]').setAttribute('slot', 'row-axis');
        const box = grid.querySelector('[data-name="precinct"] filter-box');
        box.querySelectorAll('[type=checkbox]').forEach((node) => {
            if (node.filterValue !== 33) {
                node.checked = false;
                node.dispatchEvent(new Event('change'));
            }
        });
        box.shadowRoot.querySelector('#apply').click();
        await grid.refresh();
        return [...grid.querySelector('pivot-table').shadowRoot
            .querySelectorAll('th.rowLabel')].map(node => node.textContent);
    });
    expect(kept).toEqual(['33']);
    expect(errors).toEqual([]);
});

test('leaves missing cells blank and still sorts the column keys', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', county: 'TEXT', value: 'REAL' },
        // Column keys arrive in row order (Queens, Bronx, Kings), not sorted.
        [['CT', 'Queens', 4], ['NJ', 'Bronx', 2], ['NY', 'Kings', 1]],
    );

    const { head, cells } = await pivot(page, { rowAxis: ['state'], colAxis: ['county'] });
    expect(head[0]).toEqual(['', 'county', 'Bronx', 'Kings', 'Queens']);
    expect(cells.map(cell => cell.text)).toEqual(['', '', '4', '2', '', '', '', '1', '']);
    // sparse cells used to render the literal string "undefined"
    expect(cells.filter(cell => /undefined/.test(`${cell.text}${cell.value}`))).toEqual([]);
    expect(errors).toEqual([]);
});

test('moves an axis by drag and drop', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', county: 'TEXT', value: 'REAL' },
        [['NY', 'Kings', 1], ['NY', 'Bronx', 2], ['NJ', 'Kings', 4]],
    );

    const result = await page.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        const axis = grid.querySelector('[data-name="state"]');
        const container = [...grid.shadowRoot.querySelectorAll('.axisContainer')]
            .find(node => node.querySelector('slot').name === 'row-axis');

        const dataTransfer = new DataTransfer();
        const fire = (target, type) => target.dispatchEvent(
            new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
        );

        const before = axis.getAttribute('slot');
        fire(axis, 'dragstart');
        fire(container, 'dragover');
        const placeholderWhileDragging = Boolean(grid.querySelector('.placeholder'));
        fire(container, 'drop');
        const placeholderAfterDrop = Boolean(grid.querySelector('.placeholder'));

        return { before, after: axis.getAttribute('slot'), placeholderWhileDragging, placeholderAfterDrop };
    });

    expect(result).toMatchObject({
        before: 'unused-axis',
        after: 'row-axis',
        placeholderWhileDragging: true,
        placeholderAfterDrop: false,
    });

    // The drop kicks off a refresh; wait for it rather than sleeping a fixed span.
    await expect.poll(() => page.evaluate(() => {
        const table = document.querySelector('data-grid pivot-table');
        return table
            ? [...table.shadowRoot.querySelectorAll('th.rowLabel')].map(node => node.textContent)
            : null;
    })).toEqual(['NJ', 'NY']);
    expect(errors).toEqual([]);
});

test('replaces the axis label when data-name changes', async ({ page }) => {
    const errors = await openFixture(page);
    await load(page, { state: 'TEXT', value: 'REAL' }, [['NY', 1]]);

    // `insertAdjacentText` used to leave both the old and the new label.
    const label = await page.evaluate(() => {
        const axis = document.querySelector('[data-name="state"]');
        axis.dataset.name = 'renamed';
        return axis.shadowRoot.querySelector('#label').textContent;
    });
    expect(label).toBe('renamed');
    expect(errors).toEqual([]);
});

test('keeps NULL selectable and distinct from the text "null"', async ({ page }) => {
    const errors = await openFixture(page);
    await load(
        page,
        { state: 'TEXT', value: 'REAL' },
        [[null, 1], ['null', 2], ['NY', 4]],
    );

    // GROUP BY yields three groups; stringifying the key used to merge the
    // first two into one checkbox.
    const shown = await page.evaluate(async () => {
        const box = await document.querySelector('[data-name="state"]').valueList();
        return [...box.querySelectorAll('[slot=filter-item]')].map(item => ({
            key: item.dataset.key,
            text: item.querySelector('.value').textContent,
        }));
    });
    expect(shown).toEqual([
        { key: 'null', text: '(null)' },
        { key: 'string:NY', text: 'NY' },
        { key: 'string:null', text: 'null' },
    ]);

    // Selecting only the NULL group must keep its row: `IN (?)` can never
    // match NULL, so it needs an `IS NULL` branch.
    const kept = await page.evaluate(async () => {
        const grid = document.querySelector('data-grid');
        grid.querySelector('[data-name="state"]').setAttribute('slot', 'row-axis');
        const box = grid.querySelector('[data-name="state"] filter-box');
        box.querySelectorAll('[type=checkbox]').forEach((node) => {
            if (node.filterValue !== null) {
                node.checked = false;
                node.dispatchEvent(new Event('change'));
            }
        });
        box.shadowRoot.querySelector('#apply').click();
        await grid.refresh();
        const shadow = grid.querySelector('pivot-table').shadowRoot;
        return {
            labels: [...shadow.querySelectorAll('th.rowLabel')].map(node => node.textContent),
            cells: [...shadow.querySelectorAll('td.val')].map(cell => cell.textContent),
        };
    });
    expect(kept).toEqual({ labels: ['None'], cells: ['1'] });
    expect(errors).toEqual([]);
});

test('prunes axes when the table is replaced by one with no axis columns', async ({ page }) => {
    const errors = await openFixture(page);
    await load(page, { state: 'TEXT', county: 'TEXT', value: 'REAL' }, [['NY', 'Kings', 1]]);
    const before = await page.evaluate(() => [...document.querySelectorAll('data-grid-axis')]
        .map(axis => axis.dataset.name));
    expect(before).toEqual(['state', 'county']);

    // The early return used to key off "no axis columns" rather than "no
    // table", leaving both axes pointing at columns that no longer exist.
    await load(page, { value: 'REAL' }, [[1]]);
    const after = await page.evaluate(() => [...document.querySelectorAll('data-grid-axis')]
        .map(axis => axis.dataset.name));
    expect(after).toEqual([]);
    expect(errors).toEqual([]);
});
