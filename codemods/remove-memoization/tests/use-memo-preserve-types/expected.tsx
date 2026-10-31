type Config = { mode: 'on' | 'off' };

const fromReturnType = ((): Config => ({ mode: 'on' }))();
const fromGeneric = ({ mode: 'on' }) as Config;
const fromBoth = ((): Config => ({ mode: 'off' }))();
