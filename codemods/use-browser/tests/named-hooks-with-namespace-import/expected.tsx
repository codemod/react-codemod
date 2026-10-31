import * as React from "react";
import { createPortal, browser } from "react-dom";

export function Portal(props: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={null}>
      <PortalBrowserOnly {...props} />
    </React.Suspense>
  );
}

function PortalBrowserOnly({ children }: { children: React.ReactNode }) {
  React.use(browser());
  return createPortal(children, document.body);
}
