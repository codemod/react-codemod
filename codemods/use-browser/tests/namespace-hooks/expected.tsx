import * as React from "react";
import { browser } from "react-dom";

function Widget() {
  return (
    <React.Suspense fallback={null}>
      <WidgetBrowserOnly />
    </React.Suspense>
  );
}

function WidgetBrowserOnly() {
  React.use(browser());
  return <div>{navigator.language}</div>;
}

export { Widget };
