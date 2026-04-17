import * as React1 from "react";
class C extends React1.Component { render() { return (<div ref={(ref) => {
        this.refs.refName = ref;
      }} />); } }
