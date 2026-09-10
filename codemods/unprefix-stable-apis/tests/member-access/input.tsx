import * as React from "react";

export function Sidebar({ open, children }) {
  return (
    <React.unstable_Activity mode={open ? "visible" : "hidden"}>
      <React.unstable_ViewTransition>{children}</React.unstable_ViewTransition>
    </React.unstable_Activity>
  );
}

export function useLogger(onEvent) {
  const handle = React.experimental_useEffectEvent(onEvent);
  React.useEffect(() => {
    handle("mounted");
  }, [handle]);
}
