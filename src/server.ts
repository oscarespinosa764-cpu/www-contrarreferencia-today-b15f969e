import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

declare global {
  var __CEDIM_BACKEND_CONFIG__:
    | { backendUrl?: string; backendPublishableKey?: string }
    | undefined;
}

function exposePublicBackendConfig(env: unknown) {
  const runtimeEnv = (env ?? {}) as Record<string, string | undefined>;
  globalThis.__CEDIM_BACKEND_CONFIG__ = {
    backendUrl: runtimeEnv.VITE_SUPABASE_URL ?? runtimeEnv.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL,
    backendPublishableKey:
      runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
      runtimeEnv.SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY,
  };
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      exposePublicBackendConfig(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
