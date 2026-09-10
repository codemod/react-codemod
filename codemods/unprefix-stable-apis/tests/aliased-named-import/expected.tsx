import { startTransition, ViewTransition, addTransitionType } from "react";

export function Gallery({ items, index, setIndex }) {
  function next() {
    startTransition(() => {
      addTransitionType("slide-next");
      setIndex(index + 1);
    });
  }

  return (
    <ViewTransition enter={{ "slide-next": "from-right" }} exit={{ "slide-next": "to-left" }}>
      <img src={items[index]} onClick={next} />
    </ViewTransition>
  );
}
