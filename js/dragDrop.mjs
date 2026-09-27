/** True when the pointer is past the midpoint of `target` along the slot's axis. */
const insertsAfter = (target, slot, clientX, clientY) => {
    const { bottom, left, right, top } = target.getBoundingClientRect();
    return slot === 'col-axis'
        ? clientX - left > (right - left) / 2
        : clientY - top > (bottom - top) / 2;
};

/**
 * Let <data-grid-axis> children of `host` be dragged between the axis
 * containers in `nodes`, previewing the landing spot with a placeholder.
 * `onDrop` runs once a move completes.
 */
export function installDragAndDrop(host, nodes, onDrop) {
    const placeholder = document.createElement('li');
    placeholder.classList.add('placeholder');
    placeholder.textContent = ' ';

    let dragElement = null;

    const dragLeave = () => placeholder.remove();

    const dragOver = (event) => {
        event.preventDefault();
        const { clientX, clientY, dataTransfer, target } = event;
        dataTransfer.dropEffect = 'move';

        if (target.matches('.axisContainer')) {
            placeholder.setAttribute('slot', target.querySelector('slot').name);
            host.appendChild(placeholder);
        } else if (target.matches('data-grid-axis')) {
            const slot = target.getAttribute('slot');
            placeholder.setAttribute('slot', slot);
            const after = target !== dragElement
                && insertsAfter(target, slot, clientX, clientY);
            host.insertBefore(placeholder, after ? target.nextSibling : target);
        }
    };

    const drop = (event) => {
        event.preventDefault();

        nodes.forEach((node) => {
            node.removeEventListener('dragleave', dragLeave);
            node.removeEventListener('dragover', dragOver);
            node.removeEventListener('drop', drop);
        });
        dragElement.setAttribute('slot', placeholder.getAttribute('slot'));
        placeholder.replaceWith(dragElement);
        onDrop();
    };

    const dragStart = ({ dataTransfer, target }) => {
        dragElement = target;
        dataTransfer.effectAllowed = 'move';
        dataTransfer.setData('Text', target.textContent);

        nodes.forEach((node) => {
            node.addEventListener('dragleave', dragLeave);
            node.addEventListener('dragover', dragOver);
            node.addEventListener('drop', drop);
        });
    };

    nodes.forEach(node => node.addEventListener('dragstart', dragStart));
}
