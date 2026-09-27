import { describe, expect, it } from 'vitest';

import { spanSizes } from '../js/spans.mjs';

/** The original O(n^2) definition, kept as a reference for differential tests. */
const spanSize = (data, i, j) => {
    const n = j + 1;
    const prefix = JSON.stringify(data[i].slice(0, n));
    if (i > 0 && prefix === JSON.stringify(data[i - 1].slice(0, n))) {
        return 0; // do not draw cell
    }
    for (let len = 0; i + len < data.length; len += 1) {
        if (prefix !== JSON.stringify(data[i + len].slice(0, n))) {
            return len;
        }
    }
    return data.length - i;
};

const randomKeys = (count, levels, alphabet) => Array
    .from({ length: count }, () => Array.from(
        { length: levels },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ))
    .sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));

describe('spanSizes', () => {
    it('handles no keys', () => {
        expect(spanSizes([], 2)).toEqual([]);
    });

    it('spans a repeated prefix and blanks the covered cells', () => {
        expect(spanSizes([['A', 'X'], ['A', 'Y'], ['B', 'X']], 2)).toEqual([
            [2, 1],
            [0, 1],
            [1, 1],
        ]);
    });

    it('gives a single key a full span at every level', () => {
        expect(spanSizes([['A', 'X']], 2)).toEqual([[1, 1]]);
    });

    it('spans every row when all keys are identical', () => {
        expect(spanSizes([['A'], ['A'], ['A']], 1)).toEqual([[3], [0], [0]]);
    });

    it('agrees with the quadratic definition on random sorted keys', () => {
        for (let trial = 0; trial < 500; trial += 1) {
            const levels = 1 + (trial % 3);
            const keys = randomKeys(trial % 13, levels, ['A', 'B', 'C']);
            const spans = spanSizes(keys, levels);
            keys.forEach((_key, i) => {
                for (let j = 0; j < levels; j += 1) {
                    expect(spans[i][j]).toBe(spanSize(keys, i, j));
                }
            });
        }
    });
});
