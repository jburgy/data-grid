import { spanSizes } from './spans.mjs';
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

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// see https://github.com/nicolaskrutchen/pivottable/tree/master/src/pivot.coffee#pivotTableRenderer
export class PivotTable extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' })
            .appendChild(pivotTableTemplate.cloneNode(true));
    }

    render({ colAttrs, colKeys, rowAttrs, rowKeys, values }) {
        const table = this.shadowRoot.querySelector('table');
        const { tHead } = table;
        const colSpans = spanSizes(colKeys, colAttrs.length);
        const rowSpans = spanSizes(rowKeys, rowAttrs.length);

        // The first few rows are for column headers. The corner cell, the
        // deepest column labels and the deepest row labels all overlap the
        // "row header headers" row below, hence the rowspan/colspan of 2.
        colAttrs.forEach((colAttr, j) => {
            const row = tHead.insertRow();
            if (j === 0 && rowAttrs.length) {
                const corner = document.createElement('th');
                corner.setAttribute('colspan', rowAttrs.length);
                corner.setAttribute('rowspan', colAttrs.length);
                row.appendChild(corner);
            }
            const axisLabel = document.createElement('th');
            axisLabel.classList.add('axisLabel');
            axisLabel.textContent = colAttr;
            row.appendChild(axisLabel);
            colKeys.forEach((colKey, i) => {
                const span = colSpans[i][j];
                if (!span) {
                    return; // an earlier key already covers this cell
                }
                const th = document.createElement('th');
                th.classList.add('colLabel');
                th.textContent = colKey[j];
                th.setAttribute('colspan', span);
                if (j === colAttrs.length - 1 && rowAttrs.length) {
                    th.setAttribute('rowspan', 2);
                }
                row.appendChild(th);
            });
        });

        // then a row for row header headers
        if (rowAttrs.length) {
            const row = tHead.insertRow();
            rowAttrs.forEach((rowAttr) => {
                const th = document.createElement('th');
                th.classList.add('axisLabel');
                th.textContent = rowAttr;
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
        const body = table.tBodies[0];
        rowKeys.forEach((rowKey, i) => {
            const row = body.insertRow();
            rowKey.forEach((txt, j) => {
                const span = rowSpans[i][j];
                if (!span) {
                    return;
                }
                const th = document.createElement('th');
                th.classList.add('rowLabel');
                th.textContent = txt;
                th.setAttribute('rowspan', span);
                if (j === rowAttrs.length - 1 && colAttrs.length) {
                    th.setAttribute('colspan', 2);
                }
                row.appendChild(th);
            });
            colKeys.forEach((_colKey, j) => { // this is the tight loop
                const value = values[i][j];
                const cell = row.insertCell();
                cell.classList.add('val', `row${i}`, `col${j}`);
                if (value === undefined || value === null) {
                    return;
                }
                cell.textContent = Number.isFinite(value) ? numberFormat.format(value) : value;
                cell.setAttribute('data-value', value);
            });
        });
    }
}
