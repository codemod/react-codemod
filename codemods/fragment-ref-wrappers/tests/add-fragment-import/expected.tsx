import { useEffect, useRef, Fragment } from "react";

export function Cards({ items }) {
  const groupRef = useRef(null);
  useEffect(() => {
    groupRef.current.observeUsing(new IntersectionObserver(() => {}));
  }, []);
  return (
    <Fragment ref={groupRef}>
      {items.map((item) => (
        <article key={item.id}>{item.title}</article>
      ))}
    </Fragment>
  );
}
