import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

// Shared across every custom element; resolves once the worker signals readiness.
export const promiser = await new Promise((resolve) => {
    const worker = sqlite3Worker1Promiser({ onready: () => resolve(worker) });
});
