const React = require('react');
const PT = require('prop-types');
const { Component } = React;

class ClassComponent extends Component {
    static propTypes = {
        foo: PT.string.isRequired,
    }
}
