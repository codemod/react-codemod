import { createRoot } from "react-dom/client";
import { unmountComponentAtNode } from "react-dom";

function cleanup(container) {
  const root = createRoot(container);
  root.unmount();
}
