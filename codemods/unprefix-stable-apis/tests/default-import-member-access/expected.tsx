import React from "react";

export function Panel({ children }) {
  return <React.ViewTransition name="panel">{children}</React.ViewTransition>;
}
