import { unmountComponentAtNode } from "react-dom";
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById("root"));
root.unmount();
