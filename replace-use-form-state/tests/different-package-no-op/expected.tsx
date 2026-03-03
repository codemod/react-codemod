import { useFormState } from "fake-form-library";

function Form() {
  const form = useFormState({ initial: {} });
  return <form>{form.fields}</form>;
}
