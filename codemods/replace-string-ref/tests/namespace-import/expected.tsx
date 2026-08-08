import * as React1 from "react";
class C extends React1.Component { render() { return (<div ref={(ref) => {
        if (ref === null) {
          delete this.refs.refName;
        } else {
          this.refs.refName = ref;
        }
      }} />); } }
