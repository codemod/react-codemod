import { render } from "react-dom";
import App from "./App";
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById("root"));
root.render(
  // eslint-disable-next-line react/jsx-filename-extension
  <App />
);
