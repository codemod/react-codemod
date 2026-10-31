import React from "react";
import PropTypes from "prop-types";

function Component(props) {
  return <div>{props.text}</div>;
}
Component.propTypes = {
  text: PropTypes.string.isRequired,
};
