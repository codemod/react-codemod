import React, { Component } from "react";

class MyComponent extends Component {
  inputRef = React.createRef<HTMLInputElement>();

  render() {
    return <input ref={this.inputRef} />;
  }
}

export default MyComponent;
