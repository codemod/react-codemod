import React, { useState } from "react";

export function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      {n}
    </button>
  );
}
