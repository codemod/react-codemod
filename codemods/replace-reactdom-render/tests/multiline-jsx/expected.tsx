import * as ReactDOM from "react-dom";
import { createRoot } from 'react-dom/client';

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
