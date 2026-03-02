import React from "react";

export class MyComponent extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.log(error, errorInfo);
  }
  
  render() {
    return <div>Hello</div>;
  }
}
