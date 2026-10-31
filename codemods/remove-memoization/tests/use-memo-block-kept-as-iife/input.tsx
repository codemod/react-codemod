import { useMemo } from 'react';

const prepared = useMemo(() => {
  const value = computeValue();
  return value;
}, [computeValue]);

const commented = useMemo(() => {
  // cached because computeValue is slow
  return computeValue();
}, [computeValue]);

const sideEffect = useMemo(() => {
  computeValue();
}, [computeValue]);

const empty = useMemo(() => {}, []);

const fromFunction = useMemo(function () {
  return computeValue();
}, [computeValue]);
