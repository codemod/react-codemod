import * as ReactDOM from "react-dom";
import { createRoot } from 'react-dom/client';

function cleanup(container) {
  const root = createRoot(container);
  root.unmount();
}
