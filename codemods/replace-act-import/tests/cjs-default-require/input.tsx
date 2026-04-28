const TestUtils = require("react-dom/test-utils");

TestUtils.act(() => {
  root.render(<App />);
});
