import { Suspense, use, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Portal({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) return null;
  return createPortal(children, document.body);
}
