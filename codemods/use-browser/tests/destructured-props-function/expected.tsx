import { Suspense, use } from "react";
import { browser } from "react-dom";
import { ClockSkeleton, formatNow } from "./clock";

export function LocalClock(props: { format: string }) {
  return (
    <Suspense fallback={<ClockSkeleton />}>
      <LocalClockBrowserOnly {...props} />
    </Suspense>
  );
}

function LocalClockBrowserOnly({ format }: { format: string }) {
  use(browser());
  return <time>{formatNow(format)}</time>;
}
