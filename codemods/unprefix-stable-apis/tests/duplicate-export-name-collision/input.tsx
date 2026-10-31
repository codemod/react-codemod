import { unstable_Activity, unstable_Activity as Foo } from "react";

function Activity() {
  return null;
}

export function Panel({ children }) {
  return (
    <unstable_Activity>
      <Foo>
        <Activity />
        {children}
      </Foo>
    </unstable_Activity>
  );
}
