import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

// Worker1 (sqlite3.initWorker1API) plus the opfs-sahpool VFS, which the stock
// worker never installs. db.mjs only starts this worker for that VFS.

const DIRECTORY = '.data-grid-sahpool';
const LOCK_TIMEOUT_MS = 3000;
// Every database takes a slot, and so does its journal while it writes, so the
// default of 6 runs out after a few databases on one origin.
const CAPACITY = 20;

/**
 * installOpfsSAHPoolVfs() deletes the pool directory when it fails to acquire
 * every handle (3.50), which is exactly what a second tab causes. Taking a
 * Web Lock first means a failed attempt never reaches the VFS in that case.
 * Waiting a little also covers most reloads.
 *
 * shortcut: the lock and the old worker's file handles are released at
 * teardown in no guaranteed order, so a reload can still reach a failing
 * install and lose the pool. Upgrade to sqlite-wasm 3.54 and pass
 * `preserveOnInitFailure: true` to close that gap.
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
await acquireLock(`data-grid:${DIRECTORY}`);
const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ directory: DIRECTORY });
await poolUtil.reserveMinimumCapacity(CAPACITY);

sqlite3.initWorker1API();
