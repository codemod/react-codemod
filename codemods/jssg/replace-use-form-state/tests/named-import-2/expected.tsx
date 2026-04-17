import { createPortal } from "react-dom";
import { useActionState } from "react";

function StatefulForm({}) {
  const [state, formAction] = useActionState(increment, 0);

  createPortal();
  return <form></form>;
}
