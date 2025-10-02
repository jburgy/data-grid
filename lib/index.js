import { DOMWidgetModel, DOMWidgetView } from '@jupyter-widgets/base';


export class DataGridModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            _model_name: 'DataGridModel',
            _view_name: 'DataGridView',
            _model_module: 'data-grid',
            _view_module: 'data-grid',
            table: '',
            unused_axis: [],
            row_axis: [],
            col_axis: [],
        }
    }
}

export class DataGridView extends DOMWidgetView {
    initialize(parameters) {
        super.initialize(parameters);
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('width', '100%');
        this.iframe.setAttribute('height', '500');
        this.iframe.setAttribute('frameborder', '0');

        this.dataGrid = document.createElement('data-grid');
        this.dataGrid.setAttribute('data-name', this.model.get('table'));
        this.dataGrid.setAttribute('data-db-name', this.model.get('db'));
        const getNames = target => Array.from(target.assignedNodes(), node => node.getAttribute('data-name'));

        const { shadowRoot } = this.dataGrid;
        shadowRoot.querySelectorAll('slot')
            .forEach((slotNode) => {
                const { name: slot } = slotNode;
                const trait = slot.replace('-', '_');

                // notify model when slots have changed (via drag and drop)
                slotNode.addEventListener('slotchange', ({ target }) => {
                    const names = getNames(target);
                    if (names.includes(null)) {
                        return; // don't notify ondragover
                    }
                    this.model.set(trait, names);
                    this.touch();
                });

                // listen to model.row_axis or model.col_axis changes
                if (!['row-axis', 'col-axis'].includes(slot)) {
                    return;
                }

                this.listenTo(this.model, `change:${trait}`, (_model, currentChange) => {
                    if (!indexedDB.cmp(getNames(slotNode), currentChange)) {
                        return; // already consistent
                    }

                    // first, move all nodes from current slot to 'unused-axis'
                    const assignedNodes = slotNode.assignedNodes();
                    assignedNodes.forEach(node => node.setAttribute('slot', 'unused-axis'));

                    // then, move nodes matching names to the current slot
                    // (but don't create new <data-grid-axis> nodes)
                    currentChange.forEach((name) => {
                        const node = this.dataGrid.querySelector(`data-grid-axis[data-name="${name}"]`);
                        if (node) {
                            node.setAttribute('slot', slot);
                        }
                    });

                    this.dataGrid.refresh();
                });
            });
    }

    render() {
        this.el.appendChild(this.iframe);
        // iframe.contentDocument only appears after it has been adopted => displayed
        this.displayed.then(() => {
            this.iframe
                .contentDocument
                .querySelector('body')
                .appendChild(this.dataGrid);
        });
        // initial model can only be synchronized _after_ the table has rendered
        const { model } = this;
        new MutationObserver((mutations, observer) => {
            const rendered = mutations
                .some(({ addedNodes }) => Array
                    .from(addedNodes, ({ nodeName }) => nodeName === 'PIVOT-TABLE')
                    .some(x => x));
            if (rendered) {
                ['col_axis', 'row_axis']
                    .forEach(trait => model.trigger(`change:${trait}`, model, model.get('trait'), {}));
                observer.disconnect();
            }
        }).observe(this.dataGrid, { childList: true });
    }
}

export function load_ipython_extension() { };