import { useRef, Fragment } from "react";

export function Columns({ left, right }) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  return (
    <section
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") rightRef.current.focus();
        if (event.key === "ArrowLeft") leftRef.current.focusLast();
      }}
    >
      <Fragment ref={leftRef}>{left}</Fragment>
      <Fragment ref={rightRef}>{right}</Fragment>
    </section>
  );
}
