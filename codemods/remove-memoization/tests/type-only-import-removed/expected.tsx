import type { ComponentProps, ReactNode } from 'react';
import { type FC } from 'react';

const Label: FC<{ children: ReactNode }> = ({ children }) => {
  const style = { fontWeight: 'bold' };
  return <span style={style}>{children}</span>;
};
