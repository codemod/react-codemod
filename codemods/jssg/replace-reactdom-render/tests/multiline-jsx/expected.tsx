import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";

function show(container) {
    const root = createRoot(container);
    root.render(
      <NotifyContent
        isIn={false}
        text={text}
        status={status}
      />
    );
}
