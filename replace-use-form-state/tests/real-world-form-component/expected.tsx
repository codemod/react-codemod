"use client";

import { useActionState } from "react-dom";
import { useFormStatus } from "react-dom";

async function createPost(_prev: { error?: string } | null, formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) {
    return { error: "Title is required" };
  }
  await fetch("/api/posts", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return { error: undefined };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create Post"}
    </button>
  );
}

export function CreatePostForm() {
  const [state, formAction] = useActionState(createPost, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required />
      </div>
      {state?.error && <p className="text-red-500">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
