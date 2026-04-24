import * as React from 'react';

const MemoizedWidget = React.memo(Widget);
const handler = React.useCallback(() => value, [value]);
