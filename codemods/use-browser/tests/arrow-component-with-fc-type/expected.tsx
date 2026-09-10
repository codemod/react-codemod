import { type FC, Suspense, use } from 'react';
import { browser } from 'react-dom';
import { Skeleton } from './skeleton';

export const Viewport: FC<{ label: string }> = (props) => {
  return (
    <Suspense fallback={<Skeleton lines={2} />}>
      <ViewportBrowserOnly {...props} />
    </Suspense>
  );
};

const ViewportBrowserOnly: FC<{ label: string }> = ({ label }) => {
  use(browser());
  return (
    <p>
      {label}: {window.innerWidth}px
    </p>
  );
};
