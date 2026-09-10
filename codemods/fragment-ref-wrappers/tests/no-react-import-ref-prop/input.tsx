"use client";

export function Group({ ref, children }) {
  return (
    <span ref={ref} style={{ display: 'contents' }}>
      {children}
    </span>
  );
}
