declare namespace NodeJS {
  interface Require {
    requireActual(moduleName: string): unknown;
  }
}
