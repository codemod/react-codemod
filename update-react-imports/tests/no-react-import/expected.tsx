import { useState } from "react";

function MyComponent() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}

export default MyComponent;
