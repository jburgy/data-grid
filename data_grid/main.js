/* eslint-disable camelcase,import/no-amd,linebreak-style,no-underscore-dangle */

define([
    'base/js/namespace',
    'nbextensions/jupyter-js-widgets/extension',
    'nbextensions/data-grid/dataGrid',
], (Jupyter, { DOMWidgetView }) => {
    const databases = new Set();

    const DataGridView = DOMWidgetView.extend({
        initialize(parameters) {
            DataGridView.__super__.initialize.call(this, parameters);
            this.iframe = document.createElement('iframe');
            this.iframe.setAttribute('width', '100%');
            this.iframe.setAttribute('height', '500');
            this.iframe.setAttribute('frameborder', '0');

            this.dataGrid = document.createElement('data-grid');
            this.dataGrid.setAttribute('data-name', this.model.get('table'));
            this.dataGrid.setAttribute('data-db-name', this.model.get('db'));
            this.dataGrid.setAttribute('data-db-version', '1.0');
            this.dataGrid.setAttribute('data-db-displayName', Jupyter.notebook.notebook_name);
            this.dataGrid.setAttribute('data-db-size', 1024 * 1024);
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
                        currentChange.forEach((names) => {
                            const node = this.dataGrid.querySelector(`data-grid-axis[data-name="${name}"]`);
                            if (node) {
                                node.setAttribute('slot', slot);
                            }
                        });

                        this.dataGrid.refresh();
                    });
                });
        },

        render() {
            DataGridView.__super__().render.call(this);
            this.el.appendChild(this.iframe);
            // iframe.contentDocument only appears after it has been adopted => displayed
            this.displayed.then(() => {
                databases.add(this.dataGrid.getAttribute('data-db-name'));
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
    });

    const load_ipython_extension = () => {
        const { notebook: { events } } = Jupyter;
        events.on('notebook_renamed.Notebook', (_event, { name: displayName }) => {
            // openDatabase invokes InsertOrUpdateDatabaseDetails which executes
            // UPDATE Databases SET description=?, estimated_size=? WHERE origin=? AND name=?
            // which is the only way to update the 'Databases.db' metadata file from javascript
            databases.forEach(name => openDatabase(name, '1.0', displayName, 1024 * 1024));
        });
    };

    return {
        DataGridView,
        load_ipython_extension,
    };
});