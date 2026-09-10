import { useLayoutEffect, useState, useEffect } from "react";

function Left() {
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <p>Loading</p>;
  }
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
