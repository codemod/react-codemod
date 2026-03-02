import React from "react";
import PropTypes from "prop-types";

const MyComponent = ({ name }: { name: string }) => (
  <div>{name}</div>
);

MyComponent.propTypes = {
  name: PropTypes.string,
};

export default MyComponent;
