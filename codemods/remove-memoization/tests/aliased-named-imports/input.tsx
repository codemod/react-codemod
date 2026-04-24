import { memo as stabilize, useCallback as useStableCallback, useMemo as useStableMemo } from 'react';

const value = useStableMemo(() => computeValue(), [computeValue]);
const handler = useStableCallback(() => value, [value]);
const MemoizedWidget = stabilize(Widget);
