import type { StorageRef } from "./storage.server";

export function parseStorageRef(ref: string): StorageRef {
    if (ref.startsWith('local:')) {
        return { type: 'local', key: ref.slice('local:'.length) };
    }

    return { type: 'db', key: ref };
}

export function stringifyStorageRef(ref: StorageRef): string {
    if (ref.type === 'local') {
        return `local:${ref.key}`;
    }

    return ref.key;
}
