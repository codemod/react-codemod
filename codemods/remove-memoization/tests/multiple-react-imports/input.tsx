import { useMemo } from 'react';
import { useCallback, useState } from 'react';

const value = useMemo(() => computeValue(), [computeValue]);
const handler = useCallback(() => value, [value]);
const [state] = useState(0);
