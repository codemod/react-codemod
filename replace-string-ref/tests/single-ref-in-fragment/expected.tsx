import React, { Component } from "react";

class MyComponent extends Component {
  render() {
    return (
      <>
        <div>Header</div>
        <input ref={(ref) => {
        this.refs.searchInput = ref;
      }} />
      </>
    );
  }
}

export default MyComponent;
