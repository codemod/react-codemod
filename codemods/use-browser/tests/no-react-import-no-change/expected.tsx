import { useEffect, useState } from "preact/hooks";

export function Panel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <div>ready</div>;
}
