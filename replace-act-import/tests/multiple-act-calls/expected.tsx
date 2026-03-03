import React from "react";

test("example", async () => {
  React.act(() => {
    render(<App />);
  });
  React.act(() => {
    fireEvent.click(button);
  });
});
