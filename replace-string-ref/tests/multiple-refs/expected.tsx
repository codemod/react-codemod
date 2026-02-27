import React from "react";

class MyComponent extends React.Component {
  render() {
    return (
      <div>
        <input ref={(ref) => {
        this.refs.input1 = ref;
      }} />
        <input ref={(ref) => {
        this.refs.input2 = ref;
      }} />
        <button ref={(ref) => {
        this.refs.submitBtn = ref;
      }}>Submit</button>
      </div>
    );
  }
}

export default MyComponent;
