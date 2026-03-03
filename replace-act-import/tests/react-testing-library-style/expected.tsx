import React from "react";
import { renderHook } from "@testing-library/react";
import { useCounter } from "../useCounter";

describe("useCounter", () => {
  it("increments when dispatch is called", async () => {
    const { result } = renderHook(() => useCounter(0));

    await React.act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
