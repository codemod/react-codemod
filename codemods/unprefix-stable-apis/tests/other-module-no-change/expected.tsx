import { unstable_ViewTransition } from "react-experimental-shim";
import { unstable_startGestureTransition as startGestureTransition, unstable_SuspenseList as SuspenseList } from "react";

export function App({ children }) {
  return (
    <SuspenseList revealOrder="forwards">
      <unstable_ViewTransition>{children}</unstable_ViewTransition>
    </SuspenseList>
  );
}

export { startGestureTransition };
