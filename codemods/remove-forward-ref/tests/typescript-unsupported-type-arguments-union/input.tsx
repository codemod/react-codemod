import { forwardRef } from 'react';

type A = { a: 1 };
type B = { b: 1 };

const MyComponent = forwardRef<HTMLButtonElement, A | B>((props, ref) => {
  return null;
});
