import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { previewPathPrefix } from "@/lib/preview-path-prefix";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

function previewFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window === "undefined") return fetch(input, init);
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  if (!prefix || typeof input !== "string" || !input.startsWith("/") || input.startsWith(prefix)) {
    return fetch(input, init);
  }
  return fetch(`${prefix}${input}`, init);
}

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  serverFns: { fetch: previewFetch },
}));
