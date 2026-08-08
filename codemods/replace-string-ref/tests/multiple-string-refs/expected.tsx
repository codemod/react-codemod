import React from "react";
class C extends React.Component { render() { return <><div ref={(ref) => {
        if (ref === null) {
          delete this.refs.a;
        } else {
          this.refs.a = ref;
        }
      }} /><span ref={(ref) => {
        if (ref === null) {
          delete this.refs.b;
        } else {
          this.refs.b = ref;
        }
      }} /></>; } }
