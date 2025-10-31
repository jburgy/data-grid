export const template = ([innerHTML]) => {
    const element = document.createElement('template');
    element.innerHTML = innerHTML;
    return element.content;
};
