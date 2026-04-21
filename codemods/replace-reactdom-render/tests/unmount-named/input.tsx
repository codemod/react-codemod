import { unmountComponentAtNode } from "react-dom";

function cleanup(container) {
  unmountComponentAtNode(container);
}
