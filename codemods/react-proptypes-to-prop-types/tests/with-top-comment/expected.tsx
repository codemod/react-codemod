/**
 * This is some multiline comment
 */
import React from 'react';
import PropTypes from 'prop-types';

function FunctionalComponent (props) {
  return <div>{props.text}</div>;
}
FunctionalComponent.propTypes = {
  text: PropTypes.string.isRequired,
};
