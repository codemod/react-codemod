import React from "react";

class MyComponent extends React.Component {
  render() {
    return (
      <div>
        <input ref="input1" />
        <input ref="input2" />
        <button ref="submitBtn">Submit</button>
      </div>
    );
  }
}

export default MyComponent;
