import { template } from './template.mjs';

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

export class FilterSearch extends HTMLElement {
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
