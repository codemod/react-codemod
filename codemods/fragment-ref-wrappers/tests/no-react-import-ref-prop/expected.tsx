"use client";

import { Fragment } from "react";

export function Group({ ref, children }) {
  return (
    <Fragment ref={ref}>
      {children}
    </Fragment>
  );
}
