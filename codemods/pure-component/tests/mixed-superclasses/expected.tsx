import React, { PureComponent } from 'react';

function A(props) { return <div className={props.a} />; }

class B extends PureComponent {
  render() { return <div className={this.props.b} />; }
}
