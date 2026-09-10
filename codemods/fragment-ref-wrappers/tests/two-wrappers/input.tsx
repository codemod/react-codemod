import { useRef } from "react";

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
      <div ref={leftRef} style={{ display: "contents" }}>{left}</div>
      <div style={{display:"contents"}} ref={rightRef}>{right}</div>
    </section>
  );
}
