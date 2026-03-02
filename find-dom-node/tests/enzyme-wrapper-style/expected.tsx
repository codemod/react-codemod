import React from "react";
import { mount } from "enzyme";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("focuses the input on mount", () => {
    const wrapper = mount(<MyComponent />);
    const inputNode = React.findDOMNode(wrapper.find("input"));
    expect(inputNode).toBe(document.activeElement);
  });

  it("calls getDOMNode on wrapper for measurement", () => {
    const wrapper = mount(<MyComponent />);
    const domNode = React.findDOMNode(wrapper);
    expect(domNode).toBeInstanceOf(HTMLElement);
  });
});
