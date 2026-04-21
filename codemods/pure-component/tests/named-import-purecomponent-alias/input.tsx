import React, { PureComponent as P } from 'react';

class Pure extends P {
  render() { return <div className={this.props.foo} />; }
}
