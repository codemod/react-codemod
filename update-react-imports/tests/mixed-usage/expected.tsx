import { Component, createElement } from "react";

class MyComponent extends Component {
  render() {
    return createElement('div', {}, 'Hello');
  }
}

export default MyComponent;
