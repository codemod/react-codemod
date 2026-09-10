import { unstable_ViewTransition as VT, unstable_Activity as Offscreen } from 'react';

export function Row({ hidden, children }) {
  return (
    <Offscreen mode={hidden ? 'hidden' : 'visible'}>
      <VT>{children}</VT>
    </Offscreen>
  );
}
