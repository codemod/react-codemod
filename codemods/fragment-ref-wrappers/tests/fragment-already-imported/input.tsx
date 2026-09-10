import { Fragment, useEffect, useRef } from "react";

export function Row({ children, onFocus }) {
  const rowRef = useRef(null);
  useEffect(() => {
    rowRef.current.addEventListener("focusin", onFocus);
    return () => rowRef.current.removeEventListener("focusin", onFocus);
  }, [onFocus]);
  return (
    <div ref={rowRef} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
