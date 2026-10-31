import React, { useMemo, useCallback } from 'react';

const value = useMemo(() => 1, []);
const handler = useCallback(() => 2, []);
export const element = <React.Fragment />;
