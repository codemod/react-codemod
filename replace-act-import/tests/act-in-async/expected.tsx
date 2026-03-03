
it("handles async", async () => {
  await act(async () => {
    await doSomething();
  });
});
