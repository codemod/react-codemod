import { useCallback, useMemo } from 'react';

const nestedMemos = useMemo(useMemo(() => () => 42, []), []);
const memoOverCallback = useMemo(useCallback(() => 42, []), []);
const callbackOverMemo = useCallback(useMemo(() => () => 42, []), []);
