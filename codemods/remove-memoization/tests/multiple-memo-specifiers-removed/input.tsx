import {
  useCallback,
  createContext,
  useMemo,
  memo,
  useState,
  useContext,
} from 'react';
import { useMemo as useCached, useCallback as useStable, useRef } from 'react';

const Context = createContext(null);
const value = useMemo(() => 1, []);
const handler = useCallback(() => 2, []);
const Memoized = memo(Widget);
const cached = useCached(() => 3, []);
const stable = useStable(() => 4, []);
const [state] = useState(0);
const theme = useContext(Context);
const ref = useRef(null);
