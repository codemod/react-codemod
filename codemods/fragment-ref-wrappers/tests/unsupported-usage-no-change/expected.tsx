import { useEffect, useRef } from "react";

export function Fader({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.style.opacity = "1";
  }, []);
  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
