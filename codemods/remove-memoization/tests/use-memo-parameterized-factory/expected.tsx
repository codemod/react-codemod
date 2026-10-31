const withDefault = ((x = computeValue()) => x)();
const withParam = ((x) => x)();
const withRest = ((...args) => args.length)();
const withDestructure = (({ value } = defaults) => value)();
