/**
 * How many consecutive keys share each key's prefix, per nesting level.
 * `spans[i][j] === 0` means an earlier key already covers that cell.
 *
 * `keys` must be sorted, so one pass over the level at which each key first
 * differs from its predecessor suffices; comparing every key against every
 * other was quadratic in the number of keys.
 */
export const spanSizes = (keys, levels) => {
    const spans = keys.map(() => new Array(levels).fill(0));
    if (!keys.length) {
        return spans;
    }
    const openedAt = new Array(levels).fill(0);

    keys.forEach((key, i) => {
        if (i === 0) {
            return;
        }
        const previous = keys[i - 1];
        const diff = key.findIndex((part, j) => part !== previous[j]);
        for (let j = diff === -1 ? levels : diff; j < levels; j += 1) {
            spans[openedAt[j]][j] = i - openedAt[j];
            openedAt[j] = i;
        }
    });
    openedAt.forEach((start, j) => { spans[start][j] = keys.length - start; });

    return spans;
};
