/** Deterministic JSON (sorted keys, ObjectId/Date via toJSON, undefined dropped) — used for tamper-evident hashes. */
export function canonicalJson(v: any): string {
  const norm = (x: any): any => {
    if (x && typeof x.toJSON === 'function') x = x.toJSON();
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object')
      return Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, norm(x[k])]));
    return x;
  };
  return JSON.stringify(norm(v));
}
