import React, { Component } from "react";

class MyComponent extends Component {
  render() {
    const refName = "myInput";
    return <input ref={refName} />;
  }
}

export default MyComponent;
