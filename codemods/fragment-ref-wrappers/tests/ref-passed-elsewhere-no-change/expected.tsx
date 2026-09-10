import { useRef } from "react";
import { useClickOutside } from "./use-click-outside";

export function Menu({ children, onClose }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
