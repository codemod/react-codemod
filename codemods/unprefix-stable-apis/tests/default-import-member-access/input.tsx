import React from "react";

export function Panel({ children }) {
  return <React.unstable_ViewTransition name="panel">{children}</React.unstable_ViewTransition>;
}
