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
            if (!rows.some(({ value }) => value == node.getAttribute('data-value'))) {
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
