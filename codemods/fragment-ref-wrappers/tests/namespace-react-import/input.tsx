import * as R from "react";

export function Toolbar({ children }) {
  const ref = R.useRef<HTMLDivElement>(null);
  const focusFirst = () => ref.current?.focus();
  return (
    <>
      <button onClick={focusFirst}>Focus toolbar</button>
      <div ref={ref} style={{ display: "contents" }}>
        {children}
      </div>
    </>
  );
}
