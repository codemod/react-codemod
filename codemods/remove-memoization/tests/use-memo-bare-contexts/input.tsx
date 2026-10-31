import { useMemo } from 'react';

let total;
total = useMemo(() => a + b, [a, b]);

function sum() {
  return useMemo(() => a + b, [a, b]);
}

report(useMemo(() => a + b, [a, b]));
const list = [useMemo(() => a + b, [a, b])];
const object = { sum: useMemo(() => a + b, [a, b]) };
const grouped = (useMemo(() => a + b, [a, b]));
