import './dataGrid.mjs';
import './widget.css';

/**
 * @param {Node[]} target 
 * @returns {string[]}
 */
function getNames(assignedNodes) {
    return Array.from(assignedNodes, node => node.getAttribute('data-name'))
}

/**
 * @param {DataGrid} dataGrid
 * @param {HTMLSlotElement} target 
 * @param {string[]} currentChange
 */
function applyChange(dataGrid, target, currentChange) {
    const assignedNodes = target.assignedNodes();
    if (!indexedDB.cmp(getNames(assignedNodes), currentChange)) {
        return; // already consistent
    }

    // first, move all nodes from current slot to 'unused-axis'
    assignedNodes.forEach(node => node.setAttribute('slot', 'unused-axis'));

    // then, move nodes matching names to the current slot
    // (but don't create new <data-grid-axis> nodes)
    currentChange.forEach((name) => {
        const node = dataGrid.querySelector(`data-grid-axis[data-name="${name}"]`);
        if (node) {
            node.setAttribute('slot', target.name);
        }
    });
}

function render({ model, el}) {
    const dataGrid = document.createElement('data-grid');
    dataGrid.setAttribute('data-name', model.get('table'));
    dataGrid.setAttribute('data-db-name', model.get('db'));
    dataGrid.setAttribute('data-source', model.get('source'));

    const { shadowRoot } = dataGrid;
    shadowRoot.querySelectorAll('slot')
        .forEach((slotNode) => {
            const { name: slot } = slotNode;
            const trait = slot.replace('-', '_');

            // notify model when slots have changed (via drag and drop)
            slotNode.addEventListener('slotchange', ({ target }) => {
                const names = getNames(target.assignedNodes());
                if (names.includes(null)) {
                    return; // don't notify ondragover
                }
                model.set(trait, names);
                model.save_changes();
            });

            // listen to model.row_axis or model.col_axis changes
            if (!['row-axis', 'col-axis'].includes(slot)) {
                return;
            }

            model.on(`change:${trait}`, () => {
                applyChange(dataGrid, slotNode, model.get(trait));
                dataGrid.refresh();
            });
        });

    // initial model can only be synchronized _after_ the table has rendered
    dataGrid.addEventListener('component-ready', () => {
        applyChange(dataGrid, shadowRoot.querySelector('slot[name="col-axis"]'), model.get("col_axis"));
        applyChange(dataGrid, shadowRoot.querySelector('slot[name="row-axis"]'), model.get("row_axis"));
        dataGrid.refresh();
    }, {once: true});

    el.appendChild(dataGrid);
}

export default { render };
