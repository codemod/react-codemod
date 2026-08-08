import React from "react";
export default class C extends React.Component { render() { return (<div ref={(ref) => {
        if (ref === null) {
          delete this.refs.refName;
        } else {
          this.refs.refName = ref;
        }
      }} />); } }
