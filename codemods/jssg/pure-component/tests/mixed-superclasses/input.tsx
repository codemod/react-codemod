import React, { Component, PureComponent } from 'react';

class A extends Component {
  render() { return <div className={this.props.a} />; }
}

class B extends PureComponent {
  render() { return <div className={this.props.b} />; }
}
