import ReactDOM from "react-dom";
import { createRoot } from 'react-dom/client';

function mount(container) {
  const root = createRoot(container);
  root.render(<App />);
  (onReady)();
}
