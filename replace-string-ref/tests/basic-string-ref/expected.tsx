import React, { Component } from "react";

class MyComponent extends Component {
  render() {
    return <input ref={(ref) => {
        this.refs.myInput = ref;
      }} />;
  }
}

export default MyComponent;
