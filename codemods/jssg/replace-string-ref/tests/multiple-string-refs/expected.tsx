import React from "react";
class C extends React.Component { render() { return <><div ref={(ref) => {
        this.refs.a = ref;
      }} /><span ref={(ref) => {
        this.refs.b = ref;
      }} /></>; } }
