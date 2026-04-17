import React from "react";
class C extends React.Component { render(){ return (<div ref={(ref) => {
        this.refs["foo-bar"] = ref;
      }} />); } }
