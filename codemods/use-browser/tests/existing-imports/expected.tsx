import { Suspense, use } from "react";
import { createPortal, browser } from "react-dom";

export function Portal(props) {
  return (
    <Suspense fallback={null}>
      <PortalBrowserOnly {...props} />
    </Suspense>
  );
}

function PortalBrowserOnly({ children }) {
  use(browser());
  return createPortal(children, document.body);
}
