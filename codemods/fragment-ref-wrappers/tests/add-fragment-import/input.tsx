import { useEffect, useRef } from "react";

export function Cards({ items }) {
  const groupRef = useRef(null);
  useEffect(() => {
    groupRef.current.observeUsing(new IntersectionObserver(() => {}));
  }, []);
  return (
    <div ref={groupRef} style={{ display: "contents" }}>
      {items.map((item) => (
        <article key={item.id}>{item.title}</article>
      ))}
    </div>
  );
}
