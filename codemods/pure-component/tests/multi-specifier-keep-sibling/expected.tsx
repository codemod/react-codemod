import React, { useState } from 'react';

function Pure(props) { return <div className={props.foo} />; }

export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
