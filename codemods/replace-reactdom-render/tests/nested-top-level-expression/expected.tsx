import { createRoot } from "react-dom/client";
import { render } from "react-dom";

describe("suite", () => {
  const run = () => {
    const root = createRoot(theNode);
    root.render(<Component />);
  };
});
