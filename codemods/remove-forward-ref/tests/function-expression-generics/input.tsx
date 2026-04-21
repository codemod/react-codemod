import { forwardRef } from 'react';

type Props<T> = { value?: T };

const MyInput = forwardRef(function A<T extends string>(
  props: Props<T>,
  ref: React.ForwardedRef<HTMLDivElement>
): JSX.Element | null {
  return null;
});
