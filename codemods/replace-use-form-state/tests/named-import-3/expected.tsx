import { createPortal } from "react-dom";
import { useActionState as UFS } from "react";

function StatefulForm({}) {
  const [state, formAction] = UFS(increment, 0);

  createPortal();
  return <form></form>;
}
