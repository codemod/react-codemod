import * as React from "react";

function Widget() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <div>{navigator.language}</div>;
}

export { Widget };
