import { useEffect, useState } from "react";

export function Avatar({ size }: { size: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div style={{ width: size, height: size }} />;
  return <img width={size} height={size} src={localStorage.getItem("avatar") ?? ""} />;
}
