const snapshots = new Map();

export function readSnapshot(key) {
  return snapshots.get(key) || null;
}

export function writeSnapshot(key, value) {
  snapshots.set(key, { ...value, cachedAt: new Date().toISOString() });
  return snapshots.get(key);
}

export function clearSnapshots() {
  snapshots.clear();
}
