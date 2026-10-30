import { Suspense, use } from "react";
import { ClockSkeleton, formatNow } from "./clock";
import { browser } from "react-dom";

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
