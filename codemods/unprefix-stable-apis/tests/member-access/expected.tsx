import * as React from "react";

export function Sidebar({ open, children }) {
  return (
    <React.Activity mode={open ? "visible" : "hidden"}>
      <React.ViewTransition>{children}</React.ViewTransition>
    </React.Activity>
  );
}

export function useLogger(onEvent) {
  const handle = React.useEffectEvent(onEvent);
  React.useEffect(() => {
    handle("mounted");
  }, [handle]);
}
