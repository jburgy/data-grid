import { query, quoteIdent } from './db.mjs';
import { template } from './template.mjs';

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
        <span id="label"></span>
        <span class="triangle"> &#x25BE;</span>
    </span>
    <slot name="value-list"></slot>
</li>`;

const filterItemTemplate = template`
<p slot="filter-item">
    <label>
        <input type="checkbox" checked>
        <span class="value"></span>
        <span class="count"></span>
    </label>
</p>`;

export class DataGridAxis extends HTMLElement {
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
                shadowRoot.querySelector('#label').textContent = newValue;
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
            const checkboxes = Array.from(this.querySelectorAll('[type=checkbox]'), node => node.checked);
            const { classList } = shadowRoot.querySelector('.attribute');
            if (checkboxes.every(checked => checked) === classList.contains('filtered')) {
                classList.toggle('filtered');
            }
        });
    }

    async valueList() {
        const attr = this.dataset.name;
        const dataGrid = this.closest('data-grid');
        const { name, dbId } = dataGrid;
        const column = quoteIdent(attr);
        const statement = `SELECT ${column} AS value, count(1) AS valueCount
        FROM ${quoteIdent(name)} GROUP BY ${column} ORDER BY ${column}`;

        const { rows } = await query(dbId, statement);

        const valueList = this.querySelector('filter-box') || document.createElement('filter-box');
        if (!valueList.hasAttribute('slot')) {
            valueList.dataset.name = attr;
            valueList.setAttribute('slot', 'value-list');
            this.appendChild(valueList);
        }
        valueList.dataset.count = `(${rows.length})`;

        if (rows.length > 5 && !valueList.querySelector('[slot=controls]')) {
            const controls = document.createElement('filter-search');
            controls.setAttribute('slot', 'controls');
            valueList.appendChild(controls);
        }

        valueList.querySelectorAll('[slot=filter-item]').forEach((node) => {
            if (!rows.some(([value]) => String(value) === node.dataset.value)) {
                node.remove();
            }
        });

        // Rows arrive ORDER BY value, so re-appending each in turn keeps the
        // slotted items sorted without scanning for an insertion point.
        const existing = new Map(Array.from(
            valueList.querySelectorAll('[slot=filter-item]'),
            node => [node.dataset.value, node],
        ));
        rows.forEach(([value, valueCount]) => {
            const key = String(value);
            let item = existing.get(key);
            if (!item) {
                item = filterItemTemplate.cloneNode(true).firstElementChild;
                item.dataset.value = key;
                item.querySelector('.value').textContent = key;

                const checkbox = item.querySelector('input');
                checkbox.filterValue = value; // raw value, so SQL binding keeps its type
                checkbox.addEventListener('change',
                    ({ currentTarget }) => currentTarget.classList.toggle('changed'));
            }
            item.querySelector('.count').textContent = `(${valueCount})`;
            valueList.appendChild(item);
        });

        return valueList;
    }
}
