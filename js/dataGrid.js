import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

const promiser = await new Promise((resolve) => {
    const _promiser = sqlite3Worker1Promiser({
        onready: () => resolve(_promiser),
    });
});



const template = ([innerHTML]) => {
    const element = document.createElement('template');
    element.innerHTML = innerHTML;
    return element.content;
};

const pivotTableTemplate = template`
<style>
    table {
        font-size: 8pt;
        text-align: left;
        border-collapse: collapse;
    }
    table thead tr th, table tbody tr th {
        background-color: #E6EEEE;
        border: 1px solid #CDCDCD;
        font-size: 8pt;
        padding: 5px;
    }
    table .colLabel { text-align: center; }
    table .totalLabel { text-align: right; }
    table tbody tr td {
        color: #3D3D3D;
        padding: 5px;
        background-color: #FFF;
        border: 1px solid #CDCDCD;
        vertical-align: top;
        text-align: right;
    }
</style>
<table>
    <thead></thead>
    <tbody></tbody>
</table>`;

const spanSize = (data, i, j) => {
    const n = j + 1;
    const arr = data[i].slice(0, n);
    if (i > 0) {
        if (!indexedDB.cmp(arr, data[i - 1].slice(0, n))) {
            return -1; // do not draw cell
        }
    }
    for (let len = 0; i + len < data.length; len += 1) {
        if (indexedDB.cmp(arr, data[i + len].slice(0, n))) {
            return len;
        }
    }
    return data.length - i;
};

// see https://github.com/nicolaskrutchen/pivottable/tree/master/src/pivot.coffee#pivotTableRenderer
class PivotTable extends HTMLElement {
    constructor({ colAttrs, colKeys, rowAttrs, rowKeys, values }) {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(pivotTableTemplate.cloneNode(true));

        const table = this.shadowRoot.querySelector('table');
        const tHead = table.querySelector('thead');

        // the first few rows are for column headers
        colAttrs.forEach((c, j) => {
            const row = tHead.insertRow();
            if (j === 0 && rowAttrs.length) {
                const th = document.createElement('th');
                th.setAttribute('colspan', rowAttrs.length);
                th.setAttribute('rowspan', colAttrs.length);
                row.appendChild(th);
            }
            const th = document.createElement('th');
            th.className = 'axisLabel';
            th.textContent = c;
            row.appendChild(th);
            colKeys.forEach((colKey, i) => {
                const span = spanSize(colKeys, i, j);
                if (span !== -1) {
                    const th = document.createElement('th'); // eslint-disable-line no-shadow
                    th.classList.add('colLabel');
                    th.textContent = colKey[j];
                    th.setAttribute('colspan', span);
                    if (j === colAttrs.length - 1 && rowAttrs.length) {
                        th.setAttribute('rowspan', 2);
                    }
                    row.appendChild(th);
                }
            });
        });

        // then a row for row header headers
        if (rowAttrs.length) {
            const row = tHead.insertRow();
            rowAttrs.forEach((r) => {
                const th = document.createElement('th');
                th.classList.add('axisLabel');
                th.textContent = r;
                row.appendChild(th);
            });
            const th = document.createElement('th');
            if (!colAttrs.length) {
                th.classList.add('totalLabel', 'rowTotalLabel');
                th.textContent = 'Totals';
            }
            row.appendChild(th);
        }

        // now the actual data rows, with their row headers and totals
        const body = document.createElement('tbody');
        rowKeys.forEach((rowKey, i) => {
            const row = body.insertRow();
            rowKey.forEach((txt, j) => {
                const span = spanSize(rowKeys, i, j);
                if (span !== -1) {
                    const th = document.createElement('th');
                    th.classList.add('rowLabel');
                    th.textContent = txt;
                    th.setAttribute('rowspan', span);
                    if (j === rowAttrs.length - 1 && colAttrs.length) {
                        th.setAttribute('colspan', 2);
                    }
                    row.appendChild(th);
                }
            });
            colKeys.forEach((_colKey, j) => { // this is the tight loop
                const value = values[i][j];
                const cell = row.insertCell();
                cell.classList.add('val', `row${i}`, `col${j}`);
                cell.textContent = Number.isFinite(value)
                    ? value.toFixed(0).replace(/\d{1,3}(?=(\d{3})+(?!\d))/g, '$&,')
                    : value;
                cell.setAttribute('data-value', value);
            });
        });
        table.appendChild(body);
        return this;
    }
}

const filterSearchTemplate = template`
<style>
    p { margin: 10px auto; }
    input { width: 230px }
</style>
<p>
    <input placeholder="Filter values" id="search">
    <br>
    <button type="button" id="select-all">Select All</button>
    <button type="button" id="select-none">Select None</button>
</p>`;

class FilterSearch extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(filterSearchTemplate.cloneNode(true));
    }

    clearSearch() {
        const { shadowRoot } = this;
        const search = shadowRoot.querySelector('input');
        if (search) {
            search.value = '';
            search.dispatchEvent(new Event('keyup'));
        }
    }

    connectedCallback() {
        const { shadowRoot } = this;
        const valueList = this.closest('filter-box');

        const search = shadowRoot.querySelector('#search');
        search.addEventListener('keyup', ({ target: { value } }) => {
            const filter = value.toLowerCase().trim();

            const nodes = valueList.querySelectorAll('[slot=filter-item] #value');
            nodes.forEach((node) => {
                const { style } = node.closest('[slot=filter-item]');
                const { textContent } = node;
                style.setProperty('display', textContent.includes(filter) ? '' : 'none');
            });
        });

        const selectAll = shadowRoot.querySelector('#select-all');
        selectAll.addEventListener('click', () => {
            const nodes = valueList.querySelectorAll('[type=checkbox]:not(:checked)');
            nodes.forEach((node) => {
                node.checked = true; // eslint-disable no-param-reassign
                node.classList.toggle('changed');
            });
        });

        const selectNone = shadowRoot.querySelector('#select-none');
        selectNone.addEventListener('click', () => {
            const nodes = valueList.querySelectorAll('[type=checkbox]:checked');
            nodes.forEach((node) => {
                node.checked = false; // eslint-disable no-param-reassign
                node.classList.toggle('changed');
            });
        });
    }
}

const filterBoxTemplate = template`
<style>
    :host {
        z-index: 100;
        width: 300px;
        border: 1px solid gray;
        background-color: #fff;
        position: absolute;
        text-align: center;
    }
    h4 { margin: 15px; }
    label { font-weight: normal };
    input[type='checkbox'] { margin-right: 10px; margin-left: 10px; }
    .count { color: gray; font-weight: normal; margin-left: 3px }
    div {
        text-align: left;
        font-size: 14px;
        white-space: nowrap;
        overflow-y: scroll;
        width: 100%;
        max-height: 250px;
        border-top: 1px solid lightgrey;
        border-bottom: 1px solid lightgrey;
    }
    ::slotted([slot="filter-item"]) { margin: 5px; }
</style>
<h4>
    <span id="name"></span>
    <span class="count"></span>
</h4>
<slot name="controls"></slot>
<div>
    <slot name="filter-item"></slot>
</div>
<p>
    <button type="button" id="apply">Apply</button>
    <button type="button" id="cancel">Cancel</button>
</p>`;

class FilterBox extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(filterBoxTemplate.cloneNode(true));
    }

    static get observedAttributes() {
        return ['data-name', 'data-count'];
    }

    attributeChangedCallback(name, _oldValue, newValue) {
        const { shadowRoot } = this;
        const selector = { 'data-name': '#name', 'data-count': '.count' }[name];
        shadowRoot.querySelector(selector).textContent = newValue;
    }

    closeFilterBox() {
        const controls = this.querySelector('filter-search');
        if (controls) {
            controls.clearSearch();
        }
        const { style } = this;
        style.setProperty('display', 'none');
    }

    connectedCallback() {
        const { shadowRoot } = this;
        const applyButton = shadowRoot.querySelector('#apply');
        applyButton.addEventListener('click', () => {
            const classLists = Array.from(this.querySelectorAll('.changed'), ({ classList }) => classList);
            classLists.forEach(classList => classList.remove('changed'));
            this.closeFilterBox();
            if (classLists.length) {
                this.dispatchEvent(new CustomEvent('refresh', { bubbles: true }));
            }
        });

        const cancelButton = shadowRoot.querySelector('#cancel');
        cancelButton.addEventListener('click', () => {
            const changed = this.querySelectorAll('.changed');
            changed.forEach((node) => {
                node.classList.remove('changed');
                node.checked = !node.checked; // eslint-disable-line no-param-reassign
            });
            this.closeFilterBox();
        });
    }
}

const dataGridAxisTemplate = template`
<style>
    li {
        padding: 8px 6px;
        list-style-type: none;
        cursor: move;
    }
    li span.attribute {
        background: #F3F3F3;
        border: 1px solid #DEDEDE;
        padding: 2px 5px;
        white-space: nowrap;
        border-radius: 5px;
    }
    .triangle {
        cursor: pointer;
        color: grey;
    }
    .filtered { font-style: italic; }
</style>
<li draggable="true">
    <span class="attribute">
        <span class="triangle"> &#x25BE;</span>
    </span>
    <slot name="value-list"></slot>
</li>`;

const filterItemTemplate = template`
<p slot="filter-item">
    <label>
        <input type="checkbox" checked>
        <span id="value"></span>
        <span class="count"></span>
    </label>
</p>`;

class DataGridAxis extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(dataGridAxisTemplate.cloneNode(true));
    }

    static get observedAttributes() {
        return ['data-name', 'slot'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const { shadowRoot } = this;
        switch (name) {
            case 'data-name':
                shadowRoot.querySelector('.attribute').insertAdjacentText('afterBegin', newValue);
                break;
            case 'slot':
                shadowRoot.querySelector('li').style.display = newValue === 'row-axis' ? 'list-item' : 'inline'
                break;
            default:
                break;
        }
    }

    connectedCallback() {
        const { shadowRoot } = this;
        const triangle = shadowRoot.querySelector('.triangle');

        triangle.addEventListener('click', ({ clientX, clientY }) => {
            this.valueList()
                .then(({ style }) => {
                    style.setProperty('display', '');
                    style.setProperty('left', `${clientX}px`);
                    style.setProperty('top', `${clientY}px`);
                });
        });

        this.addEventListener('refresh', () => {
            const checkboxes = Array.from(this.querySelectorAll('[type=checkbo]'), node => node.checked);
            const { classList } = shadowRoot.querySelector('.attribute');
            if (checkboxes.every(checked => checked) === classList.contains('filtered')) {
                classList.toggle('filtered');
            }
        });
    }

    async valueList() {
        const attr = this.getAttribute('data-name');
        const dataGrid = this.closest('data-grid');
        const { name, dbId } = dataGrid;
        const statement = `SELECT \`${attr}\` as value, count(1) as valueCount
        FROM \`${name}\` GROUP BY \`${attr}\` ORDER BY \`${attr}\``;

        const rows = [];
        await new Promise((resolve) => promiser('exec', {
            dbId,
            sql: statement,
            callback({ row, rowNumber, columnNames }) {
                if (row === undefined && rowNumber === null)
                    resolve()
                else
                    rows.push(columnNames.reduceRight((obj, key, i) => ({ [key]: row[i], ...obj }), {}));
            }
        }));

        const valueList = this.querySelector('filter-box') || document.createElement('filter-box');
        if (!valueList.hasAttribute('slot')) {
            valueList.setAttribute('data-name', attr);
            valueList.setAttribute('slot', 'value-list');
            this.appendChild(valueList);
        }
        valueList.setAttribute('data-count', `(${rows.length})`);

        if (rows.length > 5 && !valueList.querySelector('[slot=controls]')) {
            const controls = document.createElement('filter-search');
            controls.setAttribute('slot', 'controls');
            valueList.appendChild(controls);
        }

        valueList.querySelectorAll('[slot=filter-item]').forEach((node) => {
            if (!rows.some(({value}) => value == node.getAttribute('data-value'))) {
                node.parentNode.remove();
            }
        });

        const { children } = valueList;
        [...rows].forEach(({ value, valueCount }) => {
            const index = [].findIndex.call(children, child => child.getAttribute('data-value') >= value);
            if (index > -1 && children[index].getAttribute('data-value') === value) {
                return;
            }
            const filterItem = filterItemTemplate.cloneNode(true);
            filterItem.firstElementChild.setAttribute('data-value', value);

            const checkbox = filterItem.querySelector('input');
            checkbox.setAttribute('data-filter', typeof value === 'number' ? value : `'${value}'`);
            checkbox.addEventListener('change',
                ({ currentTarget }) => currentTarget.classList.toggle('changed'));

            filterItem.querySelector('#value').textContent = value;
            filterItem.querySelector('.count').textContent = `(${valueCount})`;

            valueList.insertBefore(filterItem, children[index]);
        });

        return valueList;
    }
}

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
                const fileHandle = await opfsRoot.getFileHandle(filename.slice(1), {create: true});
                const writable = await fileHandle.createWritable();
                await writable.write(Uint8Array.fromBase64(data.content), {position: 0});
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
                const rowKey = rowAttrs.length ? rowAttrs.map(attr => row[columnNames.indexOf(attr)]) : ['Totals'];
                if (!rowKeys.length || indexedDB.cmp(rowKey, rowKeys[rowKeys.length - 1])) {
                    rowKeys.push(rowKey);
                    values.push([]);
                }
                const colKey = colAttrs.length ? colAttrs.map(attr => row[columnNames.indexOf(attr)]) : ['Totals'];
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
