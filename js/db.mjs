// Talks to a dbWorker.mjs. Resolves to `call(type, args)`, which resolves with
// the worker's answer or rejects with its error, once the worker says it is
// ready. A worker that fails to start (a missing wasm file) ends before that,
// which surfaces as an `error` event.
const connect = worker => new Promise((resolve, reject) => {
    const calls = new Map();
    let nextCallId = 0;
    let ready = false;

    worker.addEventListener('error', (event) => {
        if (!ready) {
            worker.terminate();
            reject(new Error(event.message || 'The sqlite worker failed to start.'));
        }
    });

    worker.addEventListener('message', ({ data }) => {
        if (data.type === 'ready') {
            ready = true;
            resolve((type, args) => new Promise((resolveCall, rejectCall) => {
                const id = nextCallId++;
                calls.set(id, { resolveCall, rejectCall });
                worker.postMessage({ id, type, args });
            }));
            return;
        }
        const { resolveCall, rejectCall } = calls.get(data.id);
        calls.delete(data.id);
        if ('error' in data) {
            rejectCall(new Error(data.error));
        } else {
            resolveCall(data.result);
        }
    });
});

// Shared across every custom element and created on first use. A failed start
// is forgotten so a later open can retry, with a fresh worker.
let connection;
const getConnection = () => connection ??= connect(
    new Worker(new URL('./dbWorker.mjs', import.meta.url), { type: 'module' }),
).catch((error) => {
    connection = undefined;
    throw error;
});

/** Open `filename` on `vfs` and resolve to its `dbId`. */
export async function open({ filename, vfs }) {
    return (await getConnection())('open', { filename, vfs });
}

/** SQLite has no placeholders for identifiers, so quote them by hand. */
export const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

/** Run `sql` and collect every row; rejects on SQL errors. */
export async function query(dbId, sql, bind) {
    return (await getConnection())('exec', { dbId, sql, bind });
}

export const exec = query;
