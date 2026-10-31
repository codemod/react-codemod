import { useMemo } from 'react';

type Config = { mode: 'on' | 'off' };

const fromReturnType = useMemo((): Config => ({ mode: 'on' }), []);
const fromGeneric = useMemo<Config>(() => ({ mode: 'on' }), []);
const fromBoth = useMemo<Config>((): Config => ({ mode: 'off' }), []);
