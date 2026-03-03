import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ReactTestUtils from "react-dom/test-utils";
import { UserProfile } from "./UserProfile";

describe("UserProfile", () => {
  it("updates name when edited", async () => {
    render(<UserProfile userId="1" />);

    const input = screen.getByRole("textbox", { name: /name/i });
    fireEvent.change(input, { target: { value: "Jane Doe" } });

    await ReactTestUtils.act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows loading state during save", async () => {
    render(<UserProfile userId="1" />);

    await ReactTestUtils.act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(screen.getByText(/saving/i)).toHaveBeenVisible();
  });
});
