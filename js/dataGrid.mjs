import { exec, query, promiser, quoteIdent } from './db.mjs';
import { installDragAndDrop } from './dragDrop.mjs';
import { template } from './template.mjs';
import { PivotTable } from './pivotTable.mjs';
import { FilterSearch } from './filterSearch.mjs';
import { FilterBox } from './filterBox.mjs';
import { DataGridAxis } from './dataGridAxis.mjs';

const dataGridTemplate = template`
<style>
    table { color: #333; }
    select { margin-bottom: 5px; }
    ::slotted(td), .axisContainer, .values {
        border: 1px solid gray;
        background: #EEE;
        padding: 5px;
        min-width: 20px;
        min-height: 20px;
        user-select: none;
    }
    ::slotted([slot="unused-axis"]), ::slotted([slot="col-axis"]) { display: table-cell; }
    ::slotted(.placeholder) {
        padding: 3px 15px;
        border-radius: 5px;
        border: 1px dashed #AAA;
        list-style-type: none;
    }
    #renderArea { padding: 5px; }
</style>
<table cellpadding="5">
    <tbody>
        <tr>
            <td></td>
            <td class="axisContainer" id="unused">
                <slot name="unused-axis"></slot>
            </td>
        </tr>
        <tr>
            <td class="values">
                <select id="aggregator">
                    <option value="AVG">AVG</option>
                    <option value="COUNT">COUNT</option>
                    <option value="MAX">MAX</option>
                    <option value="MIN">MIN</option>
                    <option value="SUM" selected>SUM</option>
                </select>
            </td>
            <td class="axisContainer">
                <slot name="col-axis"></slot>
            </td>
        </tr>
        <tr>
            <td class="axisContainer" valign="top">
                <slot name="row-axis"></slot>
            </td>
            <td id="renderArea" valign="top">
                <slot name="render-area"></slot>
            </td>
        </tr>
    </tbody>
</table>`;

/**
 * A pivot view over one narrow table.
 *
 * The table must hold a REAL column named `value` -- the measure fed to the
 * aggregator -- plus any number of other columns, each of which becomes a
 * draggable axis.
 */
class DataGrid extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(dataGridTemplate.cloneNode(true));
    }

    get name() {
        return this.dataset.name;
    }

    async createTable(fields) {
        const { name, dbId } = this;
        const colDefs = Object.entries(fields)
            .map(([col, type]) => `${quoteIdent(col)} ${type}`)
            .join(',');
        await exec(dbId, `DROP TABLE IF EXISTS ${quoteIdent(name)}`);
        await exec(dbId, `CREATE TABLE ${quoteIdent(name)} (${colDefs})`);
    }

    /** `[{ name, type }]`, or `[]` when the table does not exist yet. */
    async columns() {
        const { name, dbId } = this;
        const { rows } = await query(dbId, `PRAGMA table_info(${quoteIdent(name)})`);
        return rows.map(([, column, type]) => ({ name: column, type: type.toUpperCase() }));
    }

    async initialize() {
        if (!this.dbId) {
            // OPFS needs SharedArrayBuffer, so it only exists on a cross-origin
            // isolated page.  `data-vfs="memdb"` trades persistence for working
            // anywhere, which is what a static demo page needs.
            const vfs = this.dataset.vfs || 'opfs';
            const filename = `${this.dataset.dbName}.sqlite3`;
            const sourceUrl = this.dataset.source;
            if (sourceUrl) {
                const response = await fetch(sourceUrl);
                const data = await response.json();  // quirk of /api/contents

                const opfsRoot = await navigator.storage.getDirectory();
                const fileHandle = await opfsRoot.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(Uint8Array.fromBase64(data.content), { position: 0 });
                await writable.close();
            }
            const openResponse = await promiser(
                'open', { filename: `/${filename}`, vfs }
            );
            this.dbId = openResponse.dbId;
        }

        const columns = await this.columns();
        if (!columns.length)
            return this; // no such table yet, so leave any existing axes alone

        // Every non-REAL column is an axis; the REAL `value` column is the measure.
        const attrValues = columns
            .filter(({ type }) => type !== 'REAL')
            .map(({ name }) => name);

        const axes = this.querySelectorAll('data-grid-axis');
        axes.forEach((axis) => {
            if (!attrValues.includes(axis.dataset.name)) {
                axis.remove();
            }
        });

        attrValues.forEach((attrValue) => {
            const existingAxis = this.querySelector(`data-grid-axis[data-name="${attrValue}"]`);
            if (existingAxis) {
                return;
            }
            const axis = document.createElement('data-grid-axis');
            axis.setAttribute('data-name', attrValue);
            axis.setAttribute('slot', 'unused-axis');
            this.appendChild(axis);
        });

        return this;
    }

    async connectedCallback() {
        await this.initialize();

        const { shadowRoot } = this;
        const refresh = () => this.refresh();

        installDragAndDrop(
            this,
            [this, ...shadowRoot.querySelectorAll('.axisContainer')],
            refresh,
        );

        shadowRoot.querySelector('#aggregator').addEventListener('change', refresh);
        this.addEventListener('refresh', refresh);
        await refresh();
        this.dispatchEvent(new Event('component-ready', { bubbles: true, composed: true }));
    }

    async refresh() {
        const attrName = node => node.dataset.name;
        const colAttrs = Array.from(this.querySelectorAll('[slot=col-axis]'), attrName);
        const rowAttrs = Array.from(this.querySelectorAll('[slot=row-axis]'), attrName);
        const { shadowRoot } = this;
        const { value: aggregator } = shadowRoot.querySelector('#aggregator');

        const filters = {};
        const valueLists = this.querySelectorAll('[slot=value-list]');
        valueLists.forEach((valueList) => {
            const checkBoxes = Array.from(valueList.querySelectorAll('[type=checkbox]'));
            if (checkBoxes.every(({ checked }) => checked)) {
                return; // nothing excluded, so no WHERE clause needed
            }
            filters[valueList.dataset.name] = checkBoxes
                .filter(({ checked }) => checked)
                .map(({ filterValue }) => filterValue);
        });

        if (!(await this.columns()).length)
            return this;
        const table = await this.pivotTable({ colAttrs, rowAttrs, aggregator, filters });
        const lastChild = this.querySelector('[slot=render-area]');

        table.setAttribute('slot', 'render-area');
        if (lastChild) {
            this.replaceChild(table, lastChild);
        } else {
            this.appendChild(table);
        }
        return this;
    }

    /**
     * Load `rows` (arrays ordered like `columns`) into the table.
     *
     * One implicit transaction per statement costs an fsync each; wrapping the
     * whole load in an explicit one is an order of magnitude faster.
     */
    async bulkInsert(columns, rows) {
        const { name, dbId } = this;
        const SQLITE_MAX_VARIABLE_NUMBER = 32766; // the default since SQLite 3.32
        const batchSize = Math.floor(SQLITE_MAX_VARIABLE_NUMBER / columns.length);
        const first = `(?${',?'.repeat(columns.length - 1)})`;
        const colList = columns.map(quoteIdent).join(',');
        const insert = `INSERT INTO ${quoteIdent(name)} (${colList}) VALUES ${first}`;

        await exec(dbId, 'BEGIN');
        try {
            for (let start = 0; start < rows.length; start += batchSize) {
                const batch = rows.slice(start, start + batchSize);
                const sql = `${insert}${`,${first}`.repeat(batch.length - 1)}`;
                await exec(dbId, sql, batch.flat());
            }
            await exec(dbId, 'COMMIT');
        } catch (error) {
            await exec(dbId, 'ROLLBACK');
            throw error;
        }
        await this.initialize();
    }

    async pivotTable({ rowAttrs, colAttrs, aggregator, filters }) {
        const { name, dbId } = this;
        const attrs = rowAttrs.concat(colAttrs).map(quoteIdent).join(', ');

        const bind = [];
        const clauses = Object.entries(filters).map(([attr, values]) => {
            const column = quoteIdent(attr);
            const present = values.filter(value => value !== null);
            const terms = [];
            if (present.length) {
                bind.push(...present);
                terms.push(`${column} IN (${present.map(() => '?').join(', ')})`);
            }
            if (present.length < values.length) {
                terms.push(`${column} IS NULL`); // NULL never matches IN (?)
            }
            if (!terms.length) {
                return '0 = 1'; // SQLite tolerates `IN ()`, but nothing else does
            }
            return terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0];
        });
        const where = clauses.length ? clauses.join(' AND ') : '1 = 1';

        const aggregate = `${aggregator}(value) AS value`;
        const selectStatement = attrs.length
            ? `SELECT ${attrs}, ${aggregate} FROM ${quoteIdent(name)} WHERE ${where} GROUP BY ${attrs} ORDER BY ${attrs}`
            : `SELECT ${aggregate} FROM ${quoteIdent(name)} WHERE ${where}`;

        const { rows, columns } = await query(dbId, selectStatement, bind);

        // Resolve column positions once rather than per row.
        const rowPos = rowAttrs.map(attr => columns.indexOf(attr));
        const colPos = colAttrs.map(attr => columns.indexOf(attr));
        const valuePos = columns.indexOf('value');
        const keyOf = (row, positions) => (positions.length
            ? positions.map(pos => row[pos] ?? 'None')
            : ['Totals']);

        // ORDER BY makes row keys arrive grouped, but column keys do not, so
        // collect them first and fill a dense matrix afterwards. Discovering a
        // column mid-stream used to splice a slot into every row seen so far.
        const rowKeys = [];
        const seenCols = new Map(); // serialised key -> key parts
        const cells = rows.map((row) => {
            const rowKey = keyOf(row, rowPos);
            if (!rowKeys.length || indexedDB.cmp(rowKey, rowKeys[rowKeys.length - 1])) {
                rowKeys.push(rowKey);
            }
            const colKey = keyOf(row, colPos);
            const id = JSON.stringify(colKey);
            seenCols.set(id, colKey);
            return { row: rowKeys.length - 1, col: id, value: row[valuePos] };
        });

        const sorted = [...seenCols].sort(([, a], [, b]) => indexedDB.cmp(a, b));
        const offsets = new Map(sorted.map(([id], j) => [id, j]));
        const colKeys = sorted.map(([, colKey]) => colKey);
        const values = rowKeys.map(() => new Array(colKeys.length));
        cells.forEach(({ row, col, value }) => {
            values[row][offsets.get(col)] = value;
        });

        const table = document.createElement('pivot-table');
        table.render({ colAttrs, colKeys, rowAttrs, rowKeys, values });
        return table;
    }
}

customElements.define('pivot-table', PivotTable);
customElements.define('filter-search', FilterSearch);
customElements.define('filter-box', FilterBox);
customElements.define('data-grid-axis', DataGridAxis);
customElements.define('data-grid', DataGrid);
