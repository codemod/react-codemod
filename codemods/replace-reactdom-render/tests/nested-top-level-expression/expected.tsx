import { render } from "react-dom";
import { createRoot } from 'react-dom/client';

describe("suite", () => {
  const run = () => {
    const root = createRoot(theNode);
    root.render(<Component />);
  };
});
