import { expect, test } from '@playwright/test';

// A small stand-in for the NYC open-data response, so the test does not depend
// on a third-party endpoint.  The shape matters more than the values: wide
// columns plus several *_amount columns for the demo to melt.
const VIOLATIONS = [
    {
        plate: 'ABC1234', state: 'NY', license_type: 'PAS', summons_number: '1',
        issue_date: '01/02/2026', violation_time: '09:15A', violation: 'NO PARKING',
        precinct: '019', county: 'NY', issuing_agency: 'TRAFFIC',
        violation_status: 'HEARING HELD', judgment_entry_date: '',
        summons_image: 'http://example.invalid/1',
        fine_amount: '115', penalty_amount: '10', interest_amount: '0',
        reduction_amount: '5', payment_amount: '120', amount_due: '0',
    },
    {
        plate: 'XYZ9876', state: 'NJ', license_type: 'COM', summons_number: '2',
        issue_date: '03/04/2026', violation_time: '02:30P', violation: 'DOUBLE PARKING',
        precinct: '077', county: 'BK', issuing_agency: 'POLICE',
        violation_status: '', judgment_entry_date: '',
        summons_image: 'http://example.invalid/2',
        fine_amount: '65', penalty_amount: '0', interest_amount: '0',
        reduction_amount: '0', payment_amount: '65', amount_due: '0',
    },
    {
        plate: 'JKL5555', state: 'NY', license_type: 'PAS', summons_number: '3',
        issue_date: '05/06/2026', violation_time: '11:45A', violation: 'NO PARKING',
        precinct: '019', county: 'NY', issuing_agency: 'TRAFFIC',
        violation_status: '', judgment_entry_date: '',
        summons_image: 'http://example.invalid/3',
        fine_amount: '35', penalty_amount: '25', interest_amount: '2',
        reduction_amount: '0', payment_amount: '0', amount_due: '62',
    },
];

// Pyodide plus pandas is a large cold download.
test.setTimeout(5 * 60 * 1000);

test('drives the grid from Python on a page that is not cross-origin isolated', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        // sqlite-wasm always warns that it cannot install the OPFS VFS here;
        // that is the situation the demo is built for, not a failure.
        if (message.type() === 'error') {
            errors.push(`console: ${message.text()}`);
        }
    });

    await page.route('https://data.cityofnewyork.us/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(VIOLATIONS),
    }));

    await page.goto('./');

    // The whole point of `data-vfs="memdb"`: no COOP/COEP, which is all
    // GitHub Pages can offer.
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(false);

    const status = page.locator('#status');
    await expect(status).toHaveText(/rows\./, { timeout: 4 * 60 * 1000 });
    await expect(status).toHaveText(/^15 rows\./); // 3 records x 5 amount columns

    const pivot = await page.evaluate(() => {
        const shadow = document.querySelector('data-grid pivot-table').shadowRoot;
        const text = row => [...row.cells].map(cell => cell.textContent.trim());
        return {
            head: [...shadow.querySelector('thead').rows].map(text),
            body: [...shadow.querySelector('tbody').rows].map(text),
        };
    });

    // Python chose county for rows and amount_type for columns.
    expect(pivot.head[0]).toEqual([
        '', 'amount_type',
        'fine_amount', 'interest_amount', 'payment_amount', 'penalty_amount', 'reduction_amount',
    ]);
    expect(pivot.head[1]).toEqual(['county', '']);
    expect(pivot.body).toEqual([
        ['BK', '65', '0', '65', '0', '0'],
        ['NY', '150', '2', '120', '35', '5'],
    ]);

    // amount_due is a measure and summons_image a URL; neither should be an axis.
    const axes = await page.evaluate(() => [...document.querySelectorAll('data-grid-axis')]
        .map(axis => axis.dataset.name));
    expect(axes).not.toContain('amount_due');
    expect(axes).not.toContain('summons_image');

    expect(errors).toEqual([]);
});
