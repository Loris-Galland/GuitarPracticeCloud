// Node 25+ defines its own localStorage global, left undefined without --localstorage-file,
// and it hides the jsdom one. Tests get a small in-memory Storage instead.
if (!globalThis.localStorage) {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
