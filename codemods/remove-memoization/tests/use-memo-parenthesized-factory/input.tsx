import { useMemo } from 'react';

const value = useMemo((() => computeValue()), [computeValue]);
