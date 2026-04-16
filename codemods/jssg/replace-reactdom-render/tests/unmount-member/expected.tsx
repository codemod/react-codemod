import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";

function cleanup(container) {
  const root = createRoot(container);
  root.unmount();
}
