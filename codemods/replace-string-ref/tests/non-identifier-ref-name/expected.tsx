import React from "react";
class C extends React.Component { render(){ return (<div ref={(ref) => {
        if (ref === null) {
          delete this.refs["foo-bar"];
        } else {
          this.refs["foo-bar"] = ref;
        }
      }} />); } }
