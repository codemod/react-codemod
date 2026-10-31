const prepared = (() => {
  const value = computeValue();
  return value;
})();

const commented = (() => {
  // cached because computeValue is slow
  return computeValue();
})();

const sideEffect = (() => {
  computeValue();
})();

const empty = (() => {})();

const fromFunction = (function () {
  return computeValue();
})();
