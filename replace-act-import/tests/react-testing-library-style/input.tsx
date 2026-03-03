import * as ReactTestUtils from "react-dom/test-utils";
import { renderHook } from "@testing-library/react";
import { useCounter } from "../useCounter";

describe("useCounter", () => {
  it("increments when dispatch is called", async () => {
    const { result } = renderHook(() => useCounter(0));

    await ReactTestUtils.act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
