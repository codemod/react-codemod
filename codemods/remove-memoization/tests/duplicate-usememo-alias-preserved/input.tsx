import { useMemo as a, useMemo as b, useCallback, useState } from 'react';

const value = a(() => computeValue(), [computeValue]);
const handler = useCallback(() => value, [value]);
const stillUsed = b;
const [state] = useState(0);
