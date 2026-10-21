import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

// Each promiser is shared across every custom element and created on first
// use. memdb and opfs run on the stock worker; opfs-sahpool needs its VFS
// installed inside the worker, which only sahpoolWorker.mjs does.
let stock;
const getStock = () => stock ??= new Promise((resolve) => {
    const promiser = sqlite3Worker1Promiser({ onready: () => resolve(promiser) });
});

let sahpool;
const getSahpool = () => sahpool ??= new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sahpoolWorker.mjs', import.meta.url), { type: 'module' });
    let ready = false;
    // A failed install ends the worker before it is ready, which surfaces here.
    // Forget it so a later open can retry once the other tab has let go; each
    // retry is a fresh worker that takes the Web Lock before touching the VFS.
    worker.addEventListener('error', (event) => {
        if (!ready) {
            sahpool = undefined;
            worker.terminate();
            reject(new Error(event.message || 'The opfs-sahpool worker failed to start.'));
        }
    });
    const promiser = sqlite3Worker1Promiser({
        worker,
        onready: () => {
            ready = true;
            resolve(promiser);
        },
    });
});

// Ids from different workers can collide, so sahpool ids carry a prefix. It
// keeps dbId a plain string for callers.
const SAHPOOL_PREFIX = 'sahpool:';

const route = async dbId => (String(dbId).startsWith(SAHPOOL_PREFIX)
    ? [await getSahpool(), dbId.slice(SAHPOOL_PREFIX.length)]
    : [await getStock(), dbId]);

/**
 * Open `filename` on `vfs` and resolve to its `dbId`. The promiser rejects with
 * a message object, so unwrap it into a real Error.
 */
export async function open({ filename, vfs }) {
    const isSahpool = vfs === 'opfs-sahpool';
    try {
        const promiser = await (isSahpool ? getSahpool() : getStock());
        const { dbId } = await promiser('open', { filename, vfs });
        return isSahpool ? `${SAHPOOL_PREFIX}${dbId}` : dbId;
    } catch (error) {
        throw error?.result?.message ? new Error(error.result.message) : error;
    }
}

/** SQLite has no placeholders for identifiers, so quote them by hand. */
export const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

export async function exec(dbId, sql, bind) {
    const [promiser, id] = await route(dbId);
    return promiser('exec', { dbId: id, sql, bind });
}

/**
 * Run `sql` and collect every row. Unlike a bare `promiser('exec')` driven by a
 * completion-sentinel callback, this rejects on SQL errors rather than hanging.
 */
export async function query(dbId, sql, bind) {
    const [promiser, id] = await route(dbId);
    const rows = [];
    let columns = [];
    await promiser('exec', {
        dbId: id,
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
