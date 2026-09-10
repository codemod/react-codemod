import { useState, useEffect, Suspense, use } from "react";
import { browser } from "react-dom";

function Left() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <LeftBrowserOnly />
    </Suspense>
  );
}

function LeftBrowserOnly() {
  use(browser());
  return <p>{screen.width}</p>;
}

export function Right() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount((c) => c + 1);
  }, []);
  return <p>{count}</p>;
}

export default function Layout() {
  return (
    <>
      <Left />
      <Right />
    </>
  );
}
