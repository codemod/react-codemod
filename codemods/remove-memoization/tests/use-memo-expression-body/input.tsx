import { createContext, useCallback, useMemo } from 'react';

const Context = createContext(null);

function Component({ items, onSelect }) {
  const count = useMemo(() => items.length, [items]);
  const context = useMemo(() => ({ items, count }), [items, count]);
  const label = useMemo(() => (count === 1 ? 'item' : 'items'), [count]);
  const handler = useCallback(() => onSelect(items), [onSelect, items]);
  const total = 1 + useMemo(() => count * 2, [count]);
  const value = useMemo(compute, [compute]);
  const lazy = useMemo(async () => fetchValue(), []);

  return <Context.Provider value={useMemo(() => ({ handler }), [handler])}>{label}</Context.Provider>;
}
