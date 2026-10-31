import type { ReactNode } from 'react'
import {
  createContext,
  useState,
} from 'react'

const Context = createContext({ open: false })

export const Panel = ({ children }: { children: ReactNode }) => {
  const [open] = useState(false)
  const value = { open }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
