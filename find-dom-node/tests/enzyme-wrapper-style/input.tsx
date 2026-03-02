import React from "react";
import { mount } from "enzyme";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("focuses the input on mount", () => {
    const wrapper = mount(<MyComponent />);
    const inputNode = wrapper.find("input").getDOMNode();
    expect(inputNode).toBe(document.activeElement);
  });

  it("calls getDOMNode on wrapper for measurement", () => {
    const wrapper = mount(<MyComponent />);
    const domNode = wrapper.getDOMNode();
    expect(domNode).toBeInstanceOf(HTMLElement);
  });
});
