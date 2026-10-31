import { useMemo } from 'react';

const withDefault = useMemo((x = computeValue()) => x, []);
const withParam = useMemo((x) => x, []);
const withRest = useMemo((...args) => args.length, []);
const withDestructure = useMemo(({ value } = defaults) => value, [defaults]);
