import './dataGrid.js';
import './widget.css';

function render({ model, el}) {
    const dataGrid = document.createElement('data-grid');
    dataGrid.setAttribute('data-name', model.get('table'));
    dataGrid.setAttribute('data-db-name', model.get('db'));
    const getNames = target => Array.from(target.assignedNodes(), node => node.getAttribute('data-name'));

    const { shadowRoot } = dataGrid;
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
                model.set(trait, names);
                this.touch();
            });

            // listen to model.row_axis or model.col_axis changes
            if (!['row-axis', 'col-axis'].includes(slot)) {
                return;
            }

            model.on(`change:${trait}`, (_model, currentChange) => {
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

    el.appendChild(dataGrid);
    // initial model can only be synchronized _after_ the table has rendered
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
    }).observe(dataGrid, { childList: true });
}

export default { render };
