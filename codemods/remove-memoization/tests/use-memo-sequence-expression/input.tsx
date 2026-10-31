import { useMemo } from 'react';

const fromBody = useMemo(() => (track(), computeValue()), [computeValue]);
const fromReturn = useMemo(() => {
  return track(), computeValue();
}, [computeValue]);
