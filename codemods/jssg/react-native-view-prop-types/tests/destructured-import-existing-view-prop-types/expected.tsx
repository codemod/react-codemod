import React from 'react';
import { View, ViewPropTypes } from 'react-native';

function Component() {
  return <View />;
}

Component.propTypes = {
  style: ViewPropTypes ? ViewPropTypes.style : ViewPropTypes.style,
};

export default Component;
