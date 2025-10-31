import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import { template } from './template.mjs';
import { PivotTable } from './pivotTable.mjs';
import { FilterSearch } from './filterSearch.mjs';
import { FilterBox } from './filterBox.mjs';
import { DataGridAxis } from './dataGridAxis.mjs';

const promiser = await new Promise((resolve) => {
    const _promiser = sqlite3Worker1Promiser({
        onready: () => resolve(_promiser),
    });
});


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

class DataGrid extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(dataGridTemplate.cloneNode(true));
    }

    get name() {
        return this.getAttribute('data-name');
    }

    async createTable(fields) {
        const { name, dbId } = this;
        const colDefs = Object.entries(fields).map(([col, type]) => `\`${col}\` ${type}`).join(',');
        await promiser('exec', { dbId, sql: `DROP TABLE IF EXISTS \`${name}\`` });
        await promiser('exec', { dbId, sql: `CREATE TABLE \`${name}\` (${colDefs})` });
    }

    schema() {
        const { name, dbId } = this;
        const checkExistence = "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?";

        return new Promise((resolve) =>
            promiser('exec', {
                dbId,
                sql: checkExistence,
                bind: [name],
                callback({ row, columnNames }) {
                    resolve(row ? row[columnNames.indexOf('sql')] : null)
                },
            })
        );
    }

    async initialize() {
        let { dbId } = this;
        if (!dbId) {
            const filename = `/${this.getAttribute('data-db-name')}.sqlite3`;
            const sourceUrl = this.getAttribute('data-source');
            if (sourceUrl) {
                const response = await fetch(sourceUrl);
                const data = await response.json();  // quirk of /api/contents

                const opfsRoot = await navigator.storage.getDirectory();
                const fileHandle = await opfsRoot.getFileHandle(filename.slice(1), { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(Uint8Array.fromBase64(data.content), { position: 0 });
                await writable.close();
            }
            const openResponse = await promiser(
                'open', { filename: filename, vfs: 'opfs' }
            );
            this.dbId = dbId = openResponse.dbId;
        }

        const sql = await this.schema();
        if (!sql)
            return this;

        const [cols] = sql.replace(/\n/g, '').match(/(?<=\().*?(?=\))/);
        const attrValues = cols
            .split(/,\s*/)
            .filter(typedCol => !typedCol.endsWith('REAL'))
            .map(typedCol => typedCol.match(/(?<=[`"]).*?(?=[`"])/)[0]);
        const axes = this.querySelectorAll('data-grid-axis');
        axes.forEach((axis) => {
            if (!attrValues.includes(axis.getAttribute('data-name'))) {
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
        const nodes = [this].concat(...shadowRoot.querySelectorAll('.axisContainer'));

        let dragElement;
        const placeholder = document.createElement('li');
        placeholder.classList.add('placeholder');
        placeholder.innerText = ' ';

        const dragLeave = () => {
            placeholder.remove();
        }

        const dragOver = (event) => {
            event.preventDefault();
            const { clientX, clientY, dataTransfer, target } = event;
            dataTransfer.dropEffect = 'move';

            if (target.matches('.axisContainer')) {
                const slot = target.querySelector('slot').getAttribute('name');
                placeholder.setAttribute('slot', slot);
                this.appendChild(placeholder);
            } else if (target.matches('data-grid-axis')) {
                const slot = target.getAttribute('slot');
                placeholder.setAttribute('slot', slot);
                const { bottom, left, right, top } = target.getBoundingClientRect();
                const next = target === dragElement
                    ? false
                    : slot === 'col-axis'
                        ? (clientX - left) / (right - left) > 0.5
                        : (clientY - top) / (bottom - top) > 0.5;
                this.insertBefore(placeholder, next ? target.nextSibling : target);
            }
        }

        const drop = (event) => {
            event.preventDefault();

            nodes.forEach((node) => {
                node.removeEventListener('dragleave', dragLeave, false);
                node.removeEventListener('dragover', dragOver, false);
                node.removeEventListener('drop', drop, false);
            });
            dragElement.setAttribute('slot', placeholder.getAttribute('slot'));
            placeholder.replaceWith(dragElement);
            this.refresh();
        }

        const dragStart = ({ dataTransfer, target }) => {
            dragElement = target;
            dataTransfer.effectAllowed = 'move'; // eslint-disable-line no-param-reassign
            dataTransfer.setData('Text', target.textContent);

            nodes.forEach((node) => {
                node.addEventListener('dragleave', dragLeave, false);
                node.addEventListener('dragover', dragOver, false);
                node.addEventListener('drop', drop, false);
            });
        }

        nodes.forEach((node) => {
            node.addEventListener('dragstart', dragStart, false);
        });
        const refresh = async () => { await this.refresh(); };
        shadowRoot.querySelector('#aggregator').addEventListener('change', refresh);
        this.addEventListener('refresh', refresh);
        await refresh();
        this.dispatchEvent(new Event('component-ready', { bubbles: true, composed: true }));
    }

    async refresh() {
        const attrName = node => node.getAttribute('data-name');
        const colAttrs = Array.from(this.querySelectorAll('[slot=col-axis]'), attrName);
        const rowAttrs = Array.from(this.querySelectorAll('[slot=row-axis]'), attrName);
        const { shadowRoot } = this;
        const { value: aggregator } = shadowRoot.querySelector('#aggregator');

        const filters = {};
        const valueLists = this.querySelectorAll('[slot=value-list]');
        valueLists.forEach((valueList) => {
            const checkBoxes = valueList.querySelectorAll('[type=checkbox]');
            const checkMarks = Array.from(checkBoxes, ({ checked }) => checked);

            if (!checkMarks.every(checked => checked)) {
                filters[valueList.getAttribute('data-name')] = Array
                    .from(checkBoxes, node => node.getAttribute('data-filter'))
                    .filter((_, i) => checkMarks[i]);
            }
        });

        if (!await this.schema())
            return this;
        const table = await this.pivotTable({ colAttrs, rowAttrs, aggregator, filters });
        const lastChild = this.querySelector('[slot=render-area]')

        table.setAttribute('slot', 'render-area');
        if (lastChild) {
            this.replaceChild(table, lastChild);
        } else {
            this.appendChild(table);
        }
        return this;
    }

    async bulkInsert(columns, rows) {
        const { name, dbId } = this;
        const SQLITE_MAX_VARIABLE_NUMBER = 999;
        const batchSize = Math.floor(SQLITE_MAX_VARIABLE_NUMBER / columns.length);
        const first = `(?${',?'.repeat(columns.length - 1)})`;
        const next = `,${first}`;
        const insert = `INSERT INTO \`${name}\` (${columns.map(col => `\`${col}\``).join(',')}) VALUES ${first}`;

        while (true) {
            const batch = rows.splice(0, batchSize);
            const { length } = batch;
            if (!length)
                break;
            await promiser('exec', { dbId, sql: `${insert}${next.repeat(length - 1)}`, bind: batch.flat() });
        }
        await this.initialize();
    };

    pivotTable({ rowAttrs, colAttrs, aggregator, filters }) {
        const { name, dbId } = this;
        const attrs = rowAttrs.concat(colAttrs).map(attr => `\`${attr}\``).join(', ');
        const filter = Object.entries(filters)
            .reduce((a, [attr, values]) => `${a} AND \`${attr}\` IN (${values.join(', ')})`, '1 = 1');
        const selectStatement = attrs.length
            ? `SELECT ${attrs}, ${aggregator}(value) AS value FROM \`${name}\` WHERE ${filter} GROUP BY ${attrs} ORDER BY ${attrs}`
            : `SELECT ${aggregator}(value) AS value FROM \`${name}\` WHERE ${filter}`;

        const rowKeys = [];
        const colKeys = [];
        const values = [];

        return new Promise((resolve) => promiser('exec', {
            dbId: dbId,
            sql: selectStatement,
            callback({ row, rowNumber, columnNames }) {
                if (row === undefined && rowNumber === null) {
                    resolve(new PivotTable({ colAttrs, colKeys, rowAttrs, rowKeys, values }));
                    return;
                }
                const rowKey = rowAttrs.length ? rowAttrs.map(attr => row[columnNames.indexOf(attr)] ?? 'None') : ['Totals'];
                if (!rowKeys.length || indexedDB.cmp(rowKey, rowKeys[rowKeys.length - 1])) {
                    rowKeys.push(rowKey);
                    values.push([]);
                }
                const colKey = colAttrs.length ? colAttrs.map(attr => row[columnNames.indexOf(attr)] ?? 'None') : ['Totals'];
                const index = colKeys.findIndex(key => indexedDB.cmp(key, colKey) > -1);
                if (index === -1) {
                    colKeys.push(colKey);
                } else if (indexedDB.cmp(colKeys[index], colKey)) { // new column
                    colKeys.splice(index, 0, colKey);
                    values.forEach(item => item.splice(index, 0, undefined));
                }
                const colIdx = index === -1 ? colKeys.length - 1 : index;
                values[rowKeys.length - 1][colIdx] = row[columnNames.indexOf('value')];
            }
        }));
    }
}

customElements.define('pivot-table', PivotTable);
customElements.define('filter-search', FilterSearch);
customElements.define('filter-box', FilterBox);
customElements.define('data-grid-axis', DataGridAxis);
customElements.define('data-grid', DataGrid);
