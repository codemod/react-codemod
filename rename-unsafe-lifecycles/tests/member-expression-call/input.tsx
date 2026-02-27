import React, { Component } from "react";

class MyComponent extends Component {
  componentWillMount() {
    console.log("mounting");
  }

  componentDidMount() {
    this.componentWillMount();
  }

  render() {
    return <div>Hello</div>;
  }
}

export default MyComponent;
