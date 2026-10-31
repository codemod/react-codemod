import { useRef, Fragment } from 'react';

export function Group({ children }) {
  const ref = useRef(null);
  const focus = () => ref.current.focus();
  return (
    <Fragment ref={ref}>
      {children}
    </Fragment>
  );
}
