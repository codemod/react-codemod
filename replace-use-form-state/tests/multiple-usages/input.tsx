import { useFormState } from "react-dom";

function Form1() {
  const [a, setA] = useFormState(fn, null);
  return <form>{a}</form>;
}

function Form2() {
  const [b, setB] = useFormState(fn, null);
  return <form>{b}</form>;
}
