import { useRef } from 'react';

export function Group({ children }) {
  const ref = useRef(null);
  const focus = () => ref.current.focus();
  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
