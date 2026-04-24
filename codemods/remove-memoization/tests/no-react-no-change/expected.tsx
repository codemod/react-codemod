const value = useMemo(() => computeValue(), [computeValue]);
const MemoizedWidget = memo(Widget);
