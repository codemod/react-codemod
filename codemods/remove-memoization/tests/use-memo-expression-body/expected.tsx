import { createContext } from 'react';

const Context = createContext(null);

function Component({ items, onSelect }) {
  const count = items.length;
  const context = { items, count };
  const label = count === 1 ? 'item' : 'items';
  const handler = () => onSelect(items);
  const total = 1 + (count * 2);
  const value = compute();
  const lazy = (async () => fetchValue())();

  return <Context.Provider value={{ handler }}>{label}</Context.Provider>;
}
