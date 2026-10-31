import { useMemo } from 'react';

const value = useMemo(() => {
  return computeValue();
}, [computeValue]);
