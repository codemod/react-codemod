import React, { PropTypes } from "react";

function Component(props) {
  return <div>{props.text}</div>;
}
Component.propTypes = {
  text: PropTypes.string.isRequired,
};
