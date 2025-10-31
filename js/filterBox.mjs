import { template } from './template.mjs';

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

export class FilterBox extends HTMLElement {
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
