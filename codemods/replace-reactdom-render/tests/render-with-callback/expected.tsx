import { createRoot } from "react-dom/client";
import ReactDOM from "react-dom";

function mount(container) {
  const root = createRoot(container);
  root.render(<App />);
  (onReady)();
}
