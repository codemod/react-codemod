import {
  createContext,
  useState,
  useContext,
} from 'react';
import { useRef } from 'react';

const Context = createContext(null);
const value = 1;
const handler = () => 2;
const Memoized = Widget;
const cached = 3;
const stable = () => 4;
const [state] = useState(0);
const theme = useContext(Context);
const ref = useRef(null);
