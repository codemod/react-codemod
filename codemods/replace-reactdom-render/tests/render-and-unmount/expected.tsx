import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";

function mount(container) {
  const root = createRoot(container);
  root.render(<App />);
}

function cleanup(container) {
  const root1 = createRoot(container);
  root1.unmount();
}
