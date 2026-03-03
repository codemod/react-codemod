import { act } from "react-dom/test-utils";

it("handles async", async () => {
  await act(async () => {
    await doSomething();
  });
});
