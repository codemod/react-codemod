Object.defineProperty(Function.prototype, "requireActual", {
  value: jest.requireActual,
  configurable: true,
  writable: true,
});

