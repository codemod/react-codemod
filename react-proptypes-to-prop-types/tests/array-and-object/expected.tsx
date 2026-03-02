import PropTypes from "prop-types";
import React from "react";

Component.propTypes = {
  items: PropTypes.array,
  config: PropTypes.object,
  id: PropTypes.oneOf([1, 2]).isRequired,
};

function Component() {
  return null;
}
