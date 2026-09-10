import { unstable_ViewTransition, unstable_addTransitionType, startTransition } from "react";

export function Page({ setRoute }) {
  const go = (route: string) => {
    startTransition(() => {
      unstable_addTransitionType("nav-forward");
      setRoute(route);
    });
  };

  const transitions = { unstable_ViewTransition };

  return (
    <unstable_ViewTransition default="slow-fade">
      <button onClick={() => go("/next")}>Next</button>
    </unstable_ViewTransition>
  );
}
