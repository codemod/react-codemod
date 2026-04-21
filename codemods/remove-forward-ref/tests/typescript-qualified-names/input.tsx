import { forwardRef } from 'react';

const MyComponent = forwardRef(function Component(
  myProps: NS.Props,
  myRef: React.ForwardedRef<NS.Ref>
) {
  return null;
});
