import ReactTestUtils from "react-dom/test-utils";

test("example", async () => {
  ReactTestUtils.act(() => {
    render(<App />);
  });
  ReactTestUtils.act(() => {
    fireEvent.click(button);
  });
});
