import { useEffect, useState, type FC } from 'react';
import { Skeleton } from './skeleton';

export const Viewport: FC<{ label: string }> = ({ label }) => {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  if (hasMounted === false) return <Skeleton lines={2} />;
  return (
    <p>
      {label}: {window.innerWidth}px
    </p>
  );
};
