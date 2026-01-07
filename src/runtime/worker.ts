// runtime.worker.ts
import { AsyncLocalStorage } from "node:async_hooks";

type Env = Record<string, string>;
const requestContext = new AsyncLocalStorage<{ env: Env }>();

export const getRequestContext = () => {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("No request context");
  return ctx;
};
