import { useActionState } from "react-dom";

function Form1() {
  const [a, setA] = useActionState(fn, null);
  return <form>{a}</form>;
}

function Form2() {
  const [b, setB] = useActionState(fn, null);
  return <form>{b}</form>;
}
