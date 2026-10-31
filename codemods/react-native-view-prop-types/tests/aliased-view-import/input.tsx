import { PropTypes } from 'react';
import { requireNativeComponent, View as RNView } from 'react-native';

const Foo = requireNativeComponent('Foo');

function MyComponent(props) {
  return <Foo {...props} />;
}

MyComponent.propTypes = RNView.propTypes;

module.exports = MyComponent;
