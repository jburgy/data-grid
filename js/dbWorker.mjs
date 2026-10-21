import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

// Owns the SQLite databases for db.mjs and answers its messages with the oo1
// API. The opfs-sahpool VFS is installed on the first database that asks for
// it, so pages that use another VFS never take its lock.
//
// Importing the package entry (and not its bundled sqlite3-worker1.mjs) matters:
// the entry finds sqlite3.wasm and the OPFS proxy worker through
// `new URL('...', import.meta.url)`, which Vite rewrites for production builds.

const SAHPOOL = 'opfs-sahpool';
const DIRECTORY = '.data-grid-sahpool';
const LOCK_TIMEOUT_MS = 3000;
// Every database takes a slot, and so does its journal while it writes, so the
// default of 6 runs out after a few databases on one origin.
const CAPACITY = 20;

/**
 * installOpfsSAHPoolVfs() fails when another context holds the pool. The Web
 * Lock turns that into a clear message and lets a reload wait for the old
 * worker to let go; preserveOnInitFailure keeps the files if it fails anyway.
 */
async function acquireLock(name) {
    const signal = AbortSignal.timeout(LOCK_TIMEOUT_MS);
    await new Promise((resolve, reject) => {
        navigator.locks
            .request(name, { signal }, () => {
                resolve();
                return new Promise(() => {}); // held until this worker dies
            })
            .catch(error => reject(error.name === 'TimeoutError'
                ? new Error(
                    'The opfs-sahpool VFS is in use by another tab or window of this '
                    + 'origin. Close it, or use data-vfs="memdb".',
                )
                : error));
    });
}

const sqlite3 = await sqlite3InitModule();

// The lock is taken once per worker, because a second request from this worker
// would queue behind its own first one. Only a failed request is forgotten (a
// timeout never touched the VFS, so a later open can retry); a failed install
// stays cached, as it does inside sqlite-wasm.
let lock;
let pool;
const installPool = async () => {
    lock ??= acquireLock(`data-grid:${DIRECTORY}`).catch((error) => {
        lock = undefined;
        throw error;
    });
    await lock;
    return pool ??= sqlite3.installOpfsSAHPoolVfs({
        directory: DIRECTORY,
        initialCapacity: CAPACITY,
        preserveOnInitFailure: true,
    });
};

const dbs = new Map();
let nextDbId = 0;

const handlers = {
    async open({ filename, vfs }) {
        let db;
        if (vfs === SAHPOOL) {
            db = new (await installPool()).OpfsSAHPoolDb(filename);
        } else if (vfs === 'opfs' && sqlite3.oo1.OpfsDb) {
            db = new sqlite3.oo1.OpfsDb(filename);
        } else {
            // memdb, or an opfs this page cannot have: SQLite says "no such vfs".
            db = new sqlite3.oo1.DB({ filename, vfs });
        }
        const dbId = String(nextDbId++);
        dbs.set(dbId, db);
        return dbId;
    },

    exec({ dbId, sql, bind }) {
        const columns = [];
        const rows = dbs.get(dbId).exec({
            sql,
            bind,
            rowMode: 'array',
            returnValue: 'resultRows',
            columnNames: columns,
        });
        return { rows, columns };
    },
};

self.addEventListener('message', async ({ data: { id, type, args } }) => {
    try {
        self.postMessage({ id, result: await handlers[type](args) });
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
});

// Nothing is sent to this worker before it says so, so no message is missed
// while the module and the VFS are still loading.
self.postMessage({ type: 'ready' });
