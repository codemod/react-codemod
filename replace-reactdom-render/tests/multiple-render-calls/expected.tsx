import ReactDOM from "react-dom";
import App from "./App";
import AdminApp from "./AdminApp";import { createRoot } from 'react-dom/client';


const root = createRoot(document.getElementById("root"));
root.render(<App />);
const root1 = createRoot(document.getElementById("admin-root"));
root1.render(<AdminApp />);
