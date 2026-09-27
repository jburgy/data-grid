import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

// Shared across every custom element; resolves once the worker signals readiness.
export const promiser = await new Promise((resolve) => {
    const worker = sqlite3Worker1Promiser({ onready: () => resolve(worker) });
});

/** SQLite has no placeholders for identifiers, so quote them by hand. */
export const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

export const exec = (dbId, sql, bind) => promiser('exec', { dbId, sql, bind });

/**
 * Run `sql` and collect every row. Unlike a bare `promiser('exec')` driven by a
 * completion-sentinel callback, this rejects on SQL errors rather than hanging.
 */
export async function query(dbId, sql, bind) {
    const rows = [];
    let columns = [];
    await promiser('exec', {
        dbId,
        sql,
        bind,
        callback({ row, columnNames }) {
            if (columnNames) { // absent from the completion sentinel in some versions
                columns = columnNames;
            }
            if (row !== undefined) {
                rows.push(row);
            }
        },
    });
    return { rows, columns };
}
