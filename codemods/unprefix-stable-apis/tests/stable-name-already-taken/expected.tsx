import { ViewTransition as unstable_ViewTransition } from "react";
import { ViewTransition } from "./my-view-transition";

export function Both({ children }) {
  return (
    <unstable_ViewTransition>
      <ViewTransition>{children}</ViewTransition>
    </unstable_ViewTransition>
  );
}
