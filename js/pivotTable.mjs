import { template } from './template.mjs';

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
export class PivotTable extends HTMLElement {
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
