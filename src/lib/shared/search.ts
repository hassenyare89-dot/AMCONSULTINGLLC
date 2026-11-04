/** Route search validator producing optional string params (so links needn't pass every key). */
export function stringParams<K extends string>(...keys: K[]) {
  return (s: Record<string, unknown>): Partial<Record<K, string>> => {
    const out: Partial<Record<K, string>> = {};
    for (const k of keys) {
      const v = s[k];
      if (typeof v === "string" && v.length <= 200) out[k] = v;
    }
    return out;
  };
}
