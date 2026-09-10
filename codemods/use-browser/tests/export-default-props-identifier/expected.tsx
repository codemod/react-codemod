import React, { Suspense, use } from "react";
import { browser } from "react-dom";
import { readTheme } from "./theme";

export default function ThemeBadge(props) {
  return (
    <Suspense fallback={null}>
      <ThemeBadgeBrowserOnly {...props} />
    </Suspense>
  );
}

function ThemeBadgeBrowserOnly(props) {
  use(browser());
  return <span className={props.className}>{readTheme()}</span>;
}
