export const cases = [
  {
    name: "arrow-function",
    input: `import PropTypes from "prop-types"
import React from "react"

export const MyComponent = (props) => {
  return <span />
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export const MyComponent = (props: MyComponentProps) => {
  return <span />
}
`,
  },
  {
    name: "class-component-static",
    input: `import PropTypes from "prop-types"
import React from "react"

export class MyComponent extends React.Component {
  static propTypes = {
    bar: PropTypes.string.isRequired,
    foo: PropTypes.number,
  }

  render() {
    return <span />
  }
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export class MyComponent extends React.Component<MyComponentProps> {
  render() {
    return <span />
  }
}
`,
  },
  {
    name: "class-component",
    input: `import PropTypes from "prop-types"
import React from "react"

export class MyComponent extends React.Component {
  render() {
    return <span />
  }
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export class MyComponent extends React.Component<MyComponentProps> {
  render() {
    return <span />
  }
}
`,
  },
  {
    name: "comments",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  /**
   * A string with a
   * wrapping comment.
   * @example "foo"
   */
  bar: PropTypes.string.isRequired,
  /**
   * Some function
   */
  foo: PropTypes.func,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  /**
   * A string with a
   * wrapping comment.
   * @example "foo"
   */
  bar: string
  /**
   * Some function
   */
  foo?(...args: unknown[]): unknown
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}
`,
  },
  {
    name: "complex-props",
    preservePropTypes: "unconverted",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  optionalArray: PropTypes.array,
  optionalBool: PropTypes.bool,
  optionalFunc: PropTypes.func,
  optionalNumber: PropTypes.number,
  optionalObject: PropTypes.object,
  optionalString: PropTypes.string,
  optionalSymbol: PropTypes.symbol,
  optionalNode: PropTypes.node,
  optionalElement: PropTypes.element,
  optionalElementType: PropTypes.elementType,
  optionalEnum: PropTypes.oneOf(["News", "Photos"]),
  optionalNumericEnum: PropTypes.oneOf([1, 2, 3]),
  optionalMixedEnum: PropTypes.oneOf([1, "Unknown", false, () => {}]),
  optionalUnknownEnum: PropTypes.oneOf(Object.keys(arr)),
  optionalUnion: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  optionalArrayOf: PropTypes.arrayOf(PropTypes.number),
  optionalObjectOf: PropTypes.objectOf(PropTypes.number),
  optionalInstanceOf: PropTypes.instanceOf(Message),
  optionalObjectWithShape: PropTypes.shape({
    optionalProperty: PropTypes.string,
    requiredProperty: PropTypes.number.isRequired,
    functionProperty: PropTypes.func,
  }),
  optionalObjectWithStrictShape: PropTypes.exact({
    optionalProperty: PropTypes.string,
    requiredProperty: PropTypes.number.isRequired,
  }),
  requiredArray: PropTypes.array.isRequired,
  requiredBool: PropTypes.bool.isRequired,
  requiredFunc: PropTypes.func.isRequired,
  requiredNumber: PropTypes.number.isRequired,
  requiredObject: PropTypes.object.isRequired,
  requiredString: PropTypes.string.isRequired,
  requiredSymbol: PropTypes.symbol.isRequired,
  requiredNode: PropTypes.node.isRequired,
  requiredElement: PropTypes.element.isRequired,
  requiredElementType: PropTypes.elementType.isRequired,
  requiredEnum: PropTypes.oneOf(["News", "Photos"]).isRequired,
  requiredUnion: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  requiredArrayOf: PropTypes.arrayOf(PropTypes.number).isRequired,
  requiredObjectOf: PropTypes.objectOf(PropTypes.number).isRequired,
  requiredInstanceOf: PropTypes.instanceOf(Message).isRequired,
  requiredObjectWithShape: PropTypes.shape({
    optionalProperty: PropTypes.string,
    requiredProperty: PropTypes.number.isRequired,
  }).isRequired,
  requiredObjectWithStrictShape: PropTypes.exact({
    optionalProperty: PropTypes.string,
    requiredProperty: PropTypes.number.isRequired,
  }).isRequired,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  optionalArray?: unknown[]
  optionalBool?: boolean
  optionalFunc?(...args: unknown[]): unknown
  optionalNumber?: number
  optionalObject?: object
  optionalString?: string
  optionalSymbol?: symbol
  optionalNode?: React.ReactNode
  optionalElement?: React.ReactElement
  optionalElementType?: React.ElementType
  optionalEnum?: "News" | "Photos"
  optionalNumericEnum?: 1 | 2 | 3
  optionalMixedEnum?: 1 | "Unknown" | false | unknown
  optionalUnknownEnum?: unknown[]
  optionalUnion?: string | number
  optionalArrayOf?: number[]
  optionalObjectOf?: Record<string, number>
  optionalInstanceOf?: Message
  optionalObjectWithShape?: {
    optionalProperty?: string
    requiredProperty: number
    functionProperty?(...args: unknown[]): unknown
  }
  optionalObjectWithStrictShape?: {
    optionalProperty?: string
    requiredProperty: number
  }
  requiredArray: unknown[]
  requiredBool: boolean
  requiredFunc(...args: unknown[]): unknown
  requiredNumber: number
  requiredObject: object
  requiredString: string
  requiredSymbol: symbol
  requiredNode: React.ReactNode
  requiredElement: React.ReactElement
  requiredElementType: React.ElementType
  requiredEnum: "News" | "Photos"
  requiredUnion: string | number
  requiredArrayOf: number[]
  requiredObjectOf: Record<string, number>
  requiredInstanceOf: Message
  requiredObjectWithShape: {
    optionalProperty?: string
    requiredProperty: number
  }
  requiredObjectWithStrictShape: {
    optionalProperty?: string
    requiredProperty: number
  }
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}
`,
  },
  {
    name: "custom-validator",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  a: PropTypes.string,
  b: function () {},
  c: () => {},
  d: PropTypes.arrayOf(function() {}),
  e: PropTypes.arrayOf(() => {}),
  f: PropTypes.objectOf(function() {}),
  g: PropTypes.objectOf(() => {}),
  h: PropTypes.arrayOf(function() {}).isRequired,
  i: PropTypes.arrayOf(() => {}).isRequired,
  j: PropTypes.objectOf(function() {}).isRequired,
  k: PropTypes.objectOf(() => {}).isRequired
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  a?: string
  b?: unknown
  c?: unknown
  d?: unknown
  e?: unknown
  f?: unknown
  g?: unknown
  h: unknown
  i: unknown
  j: unknown
  k: unknown
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}
`,
  },
  {
    name: "extended-props",
    input: `import BaseComponent from "./base"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = BaseComponent.propTypes
`,
    expected: `import BaseComponent from "./base"
import React from "react"

export function MyComponent(props) {
  return <span />
}
`,
  },
  {
    name: "forward-ref-and-func",
    input: `import PropTypes from "prop-types"
import React, { forwardRef } from "react"

export const MyComponent = forwardRef((props, ref) => {
  return <span ref={ref} />
})

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}

export function ComponentA(props) {
  return <span />
}

ComponentA.propTypes = {
  a: PropTypes.string.isRequired,
  b: PropTypes.number,
}
`,
    expected: `import React, { forwardRef } from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export const MyComponent = forwardRef<HTMLElement, MyComponentProps>((props, ref) => {
  return <span ref={ref} />
})

interface ComponentAProps {
  a: string
  b?: number
}

export function ComponentA(props: ComponentAProps) {
  return <span />
}
`,
  },
  {
    name: "forward-ref",
    input: `import PropTypes from "prop-types"
import React from "react"

const MyComponent = React.forwardRef((props, ref) => {
  return <span ref={ref} />
})

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}

export default MyComponent
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

const MyComponent = React.forwardRef<HTMLElement, MyComponentProps>((props, ref) => {
  return <span ref={ref} />
})

export default MyComponent
`,
  },
  {
    name: "function-and-class",
    input: `import PropTypes from "prop-types"
import React from "react"

export function ComponentA(props) {
  return <span />
}

ComponentA.propTypes = {
  a: PropTypes.string.isRequired,
  b: PropTypes.number,
}

export class ComponentB extends React.Component {
  render() {
    return <span />
  }
}

ComponentB.propTypes = {
  c: PropTypes.array,
  d: PropTypes.object.isRequired,
}
`,
    expected: `import React from "react"

interface ComponentAProps {
  a: string
  b?: number
}

export function ComponentA(props: ComponentAProps) {
  return <span />
}

interface ComponentBProps {
  c?: unknown[]
  d: object
}

export class ComponentB extends React.Component<ComponentBProps> {
  render() {
    return <span />
  }
}
`,
  },
  {
    name: "function-component",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}
`,
  },
  {
    name: "literal-prop",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  'data-testid': PropTypes.string,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  'data-testid'?: string
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}
`,
  },
  {
    name: "memo-export",
    input: `import PropTypes from 'prop-types'
import React from 'react'

export const MyComponent = React.memo(function MyComponent(props) {
  return null
})

MyComponent.propTypes = {
  a: PropTypes.number
}
`,
    expected: `import React from 'react'

interface MyComponentProps {
  a?: number
}

export const MyComponent = React.memo(function MyComponent(props: MyComponentProps) {
  return null
})
`,
  },
  {
    name: "memo",
    input: `import PropTypes from 'prop-types'
import React from 'react'

const MyComponent = React.memo(function MyComponent(props) {
  return null
})

MyComponent.propTypes = {
  a: PropTypes.number
}
`,
    expected: `import React from 'react'

interface MyComponentProps {
  a?: number
}

const MyComponent = React.memo(function MyComponent(props: MyComponentProps) {
  return null
})
`,
  },
  {
    name: "multiple-class-components-static",
    input: `import PropTypes from "prop-types"
import React from "react"

export class ComponentA extends React.Component {
  static propTypes = {
    a: PropTypes.string.isRequired,
    b: PropTypes.number,
  }

  render() {
    return <span />
  }
}

export class ComponentB extends React.Component {
  static propTypes = {
    c: PropTypes.array,
    d: PropTypes.object.isRequired,
  }

  render() {
    return <span />
  }
}
`,
    expected: `import React from "react"

interface ComponentAProps {
  a: string
  b?: number
}

export class ComponentA extends React.Component<ComponentAProps> {
  render() {
    return <span />
  }
}

interface ComponentBProps {
  c?: unknown[]
  d: object
}

export class ComponentB extends React.Component<ComponentBProps> {
  render() {
    return <span />
  }
}
`,
  },
  {
    name: "multiple-components",
    input: `import PropTypes from "prop-types"
import React from "react"

export function ComponentA(props) {
  return <span />
}

ComponentA.propTypes = {
  a: PropTypes.string.isRequired,
  b: PropTypes.number,
}

export function ComponentB(props) {
  return <span />
}

ComponentB.propTypes = {
  c: PropTypes.array,
  d: PropTypes.object.isRequired,
}
`,
    expected: `import React from "react"

interface ComponentAProps {
  a: string
  b?: number
}

export function ComponentA(props: ComponentAProps) {
  return <span />
}

interface ComponentBProps {
  c?: unknown[]
  d: object
}

export function ComponentB(props: ComponentBProps) {
  return <span />
}
`,
  },
  {
    name: "no-export",
    input: `import PropTypes from 'prop-types'
import React from 'react'

function MyComponent(props) {
  return null
}

MyComponent.propTypes = {
  a: PropTypes.number
}
`,
    expected: `import React from 'react'

interface MyComponentProps {
  a?: number
}

function MyComponent(props: MyComponentProps) {
  return null
}
`,
  },
  {
    name: "no-prop-types",
    input: `import React from "react"

export function MyComponent(props) {
  return <span />
}
`,
  },
  {
    name: "odd-required",
    input: `import PropTypes from "prop-types"
import React from "react"

export const MyComponent = (props) => {
  return <span />
}

MyComponent.propTypes = {
  a: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.number.isRequired
  }).isRequired),
  b: PropTypes.objectOf(PropTypes.number.isRequired)
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  a?: {
    name: number
  }[]
  b?: Record<string, number>
}

export const MyComponent = (props: MyComponentProps) => {
  return <span />
}
`,
  },
  {
    name: "preserve-none",
    input: `import PropTypes from "prop-types"
import React from "react"

export function ComponentA(props) {
  return <span />
}

ComponentA.propTypes = {
  ...OtherComponent,
  a: PropTypes.string.isRequired,
  b() {}
}

export function ComponentB(props) {
  return <span />
}

ComponentB.propTypes = {
  ...ThisComponent,
  c: PropTypes.number,
  d() {}
}
`,
    expected: `import React from "react"

interface ComponentAProps {
  a: string
  b?: unknown
}

export function ComponentA(props: ComponentAProps) {
  return <span />
}

interface ComponentBProps {
  c?: number
  d?: unknown
}

export function ComponentB(props: ComponentBProps) {
  return <span />
}
`,
  },
  {
    name: "preserve-prop-types",
    preservePropTypes: "all",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
    expected: `import PropTypes from "prop-types"
import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
  },
  {
    name: "preserve-unconverted-shape",
    preservePropTypes: "unconverted",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  a: PropTypes.string,
  b: function () {},
  c: PropTypes.shape({
    d: PropTypes.bool
  })
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  a?: string
  b?: unknown
  c?: {
    d?: boolean
  }
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}

MyComponent.propTypes = {
  b: function () {}
}
`,
  },
  {
    name: "preserve-unconverted-static",
    preservePropTypes: "unconverted",
    input: `import PropTypes from "prop-types"
import React from "react"

export class MyComponent extends React.Component {
  static propTypes = {
    bar: PropTypes.string.isRequired,
    foo() {}
  }

  render() {
    return <span />
  }
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: unknown
}

export class MyComponent extends React.Component<MyComponentProps> {
  static propTypes = {
    foo() {}
  }

  render() {
    return <span />
  }
}
`,
  },
  {
    name: "preserve-unconverted",
    preservePropTypes: "unconverted",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  ...OtherComponent.propTypes,
  a: PropTypes.string,
  b: function () {},
  c: () => {},
  d: PropTypes.arrayOf(function() {}),
  e: PropTypes.arrayOf(() => {}),
  f: PropTypes.objectOf(function() {}),
  g: PropTypes.objectOf(() => {}),
}
`,
    expected: `import PropTypes from "prop-types"
import React from "react"

interface MyComponentProps {
  a?: string
  b?: unknown
  c?: unknown
  d?: unknown
  e?: unknown
  f?: unknown
  g?: unknown
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}

MyComponent.propTypes = {
  ...OtherComponent.propTypes,
  b: function () {},
  c: () => {},
  d: PropTypes.arrayOf(function() {}),
  e: PropTypes.arrayOf(() => {}),
  f: PropTypes.objectOf(function() {}),
  g: PropTypes.objectOf(() => {})
}
`,
  },
  {
    name: "spread-element",
    preservePropTypes: "unconverted",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span />
}

MyComponent.propTypes = {
  ...OtherComponent.propTypes,
  a: PropTypes.string,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  a?: string
}

export function MyComponent(props: MyComponentProps) {
  return <span />
}

MyComponent.propTypes = {
  ...OtherComponent.propTypes
}
`,
  },
  {
    name: "typescript",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  const foo: string = 'bar'
  return <span />
}

MyComponent.propTypes = {
  bar: PropTypes.string.isRequired,
  foo: PropTypes.number,
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  bar: string
  foo?: number
}

export function MyComponent(props: MyComponentProps) {
  const foo: string = 'bar'
  return <span />
}
`,
  },
  {
    name: "imported-pure-component",
    input: `import PropTypes from "prop-types"
import React, { PureComponent } from "react"

export default class MyComponent extends PureComponent {
  static propTypes = {
    foo: PropTypes.string,
  }

  render() {
    return <span>{this.props.foo}</span>
  }
}
`,
    expected: `import React, { PureComponent } from "react"

interface MyComponentProps {
  foo?: string
}

export default class MyComponent extends PureComponent<MyComponentProps> {
  render() {
    return <span>{this.props.foo}</span>
  }
}
`,
  },
  {
    name: "nested-component-assignment",
    input: `import PropTypes from "prop-types"
import React from "react"

export function renderWithLocalization(component) {
  const Wrapper = ({ children }) => <div>{children}</div>

  Wrapper.propTypes = {
    children: PropTypes.node,
  }

  return component
}
`,
    expected: `import React from "react"

interface WrapperProps {
  children?: React.ReactNode
}

export function renderWithLocalization(component) {
  const Wrapper = ({ children }: WrapperProps) => <div>{children}</div>

  return component
}
`,
  },
  {
    name: "nested-components-same-name",
    input: `import PropTypes from "prop-types"
import React from "react"

export function first(component) {
  function Wrapper({ children }) {
    return <div>{children}</div>
  }

  Wrapper.propTypes = {
    children: PropTypes.node,
  }

  return component
}

export function second(component) {
  function Wrapper({ children }) {
    return <section>{children}</section>
  }

  Wrapper.propTypes = {
    children: PropTypes.node,
  }

  return component
}
`,
    expected: `import React from "react"

interface WrapperProps {
  children?: React.ReactNode
}

export function first(component) {
  function Wrapper({ children }: WrapperProps) {
    return <div>{children}</div>
  }

  return component
}

interface WrapperProps {
  children?: React.ReactNode
}

export function second(component) {
  function Wrapper({ children }: WrapperProps) {
    return <section>{children}</section>
  }

  return component
}
`,
  },
  {
    name: "already-typed-function",
    input: `import PropTypes from "prop-types"
import React from "react"

type MyComponentArgs = {
  foo: string
  bar?: number
}

export function MyComponent({ foo, bar }: MyComponentArgs) {
  return <span>{foo}{bar}</span>
}

MyComponent.propTypes = {
  foo: PropTypes.string.isRequired,
  bar: PropTypes.number,
}
`,
    expected: `import React from "react"

type MyComponentArgs = {
  foo: string
  bar?: number
}

export function MyComponent({ foo, bar }: MyComponentArgs) {
  return <span>{foo}{bar}</span>
}
`,
  },
  {
    name: "existing-props-interface-class",
    input: `import PropTypes from "prop-types"
import React, { PureComponent } from "react"

interface LockProps {
  foo?: string
}

export default class Lock extends PureComponent<LockProps> {
  static propTypes = {
    foo: PropTypes.string,
  }

  render() {
    return <span>{this.props.foo}</span>
  }
}
`,
    expected: `import React, { PureComponent } from "react"

interface LockProps {
  foo?: string
}

export default class Lock extends PureComponent<LockProps> {
  render() {
    return <span>{this.props.foo}</span>
  }
}
`,
  },
  {
    name: "union-with-function",
    input: `import PropTypes from "prop-types"
import React from "react"

export function MyComponent(props) {
  return <span>{props.children}</span>
}

MyComponent.propTypes = {
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]),
}
`,
    expected: `import React from "react"

interface MyComponentProps {
  children?: React.ReactNode | ((...args: unknown[]) => unknown)
}

export function MyComponent(props: MyComponentProps) {
  return <span>{props.children}</span>
}
`,
  },
];
