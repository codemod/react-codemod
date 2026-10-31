import React, { Component, useState } from 'react';

class Pure extends Component {
  render() { return <div className={this.props.foo} />; }
}

export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
