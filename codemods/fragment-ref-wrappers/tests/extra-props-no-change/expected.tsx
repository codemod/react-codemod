import { useRef } from "react";

export function Labelled({ children }) {
  const ref = useRef(null);
  return (
    <div ref={ref} style={{ display: "contents" }} className="labelled">
      {children}
    </div>
  );
}
