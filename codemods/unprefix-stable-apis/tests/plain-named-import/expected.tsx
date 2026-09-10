import { ViewTransition, addTransitionType, startTransition } from "react";

export function Page({ setRoute }) {
  const go = (route: string) => {
    startTransition(() => {
      addTransitionType("nav-forward");
      setRoute(route);
    });
  };

  const transitions = { unstable_ViewTransition: ViewTransition };

  return (
    <ViewTransition default="slow-fade">
      <button onClick={() => go("/next")}>Next</button>
    </ViewTransition>
  );
}
