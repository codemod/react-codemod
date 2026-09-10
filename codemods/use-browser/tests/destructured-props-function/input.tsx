import { useEffect, useState } from "react";
import { ClockSkeleton, formatNow } from "./clock";

export function LocalClock({ format }: { format: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <ClockSkeleton />;
  return <time>{formatNow(format)}</time>;
}
