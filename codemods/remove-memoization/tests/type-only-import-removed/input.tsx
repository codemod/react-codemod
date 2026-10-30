import type { ComponentProps, ReactNode } from 'react';
import { useMemo, type FC } from 'react';

const Label: FC<{ children: ReactNode }> = ({ children }) => {
  const style = useMemo(() => ({ fontWeight: 'bold' }), []);
  return <span style={style}>{children}</span>;
};
