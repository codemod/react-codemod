import { useEffect, useState } from "react";

export function Panel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <div data-mounted={mounted}>ready</div>;
}
