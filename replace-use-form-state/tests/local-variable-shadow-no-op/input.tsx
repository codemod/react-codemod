import { useFormState } from "react-dom";

function Form() {
  const [state, formAction] = useFormState(submit, null);

  function handleClick() {
    const useFormState = "local variable - should NOT be replaced";
    console.log(useFormState);
  }

  return (
    <form action={formAction}>
      <button type="button" onClick={handleClick}>
        Help
      </button>
      <button type="submit">Submit</button>
    </form>
  );
}

async function submit(_prev: string | null, _data: FormData) {
  return "ok";
}
