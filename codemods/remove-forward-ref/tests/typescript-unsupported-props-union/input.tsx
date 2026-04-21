import { forwardRef } from 'react';

type A = { a: 1 };
type B = { b: 1 };

const MyComponent = forwardRef(function Component(
  myProps: A | B,
  myRef: React.ForwardedRef<HTMLButtonElement>
) {
  return null;
});
