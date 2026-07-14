/**
 * App Worker — Hono-based Cloudflare Worker for DeepSpace apps.
 *
 * Each app owns its RecordRoom DOs. Schemas are baked in at deploy time.
 *
 * Handles:
 *   - WebSocket → app's own RecordRoom DO (real-time data)
 *   - Auth proxy → auth-worker (same-origin cookies)
 *   - Integration proxy → api-worker (LLM, search, etc.)
 *   - AI chat (Vercel AI SDK + DeepSpace proxy)
 *   - Server actions (app-defined, bypass user RBAC)
 *   - Scoped R2 file storage
 *   - HMAC-authenticated cron
 *   - Static asset serving with SPA fallback
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyJwt, apiWorkerFetch, platformWorkerFetch, authWorkerFetch } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import { RecordRoom, YjsRoom, CanvasRoom, PresenceRoom, CronRoom } from 'deepspace/worker'
import type { ActionTools, ActionResult, DOManifest, DOBindings } from 'deepspace/worker'
import { actions } from './src/actions/index.js'
import { tasks as cronTasks, runTask as runCronTask } from './src/cron.js'
import { schemas } from './src/schemas.js'
import { integrations } from './src/integrations.js'
import { registerAiChatRoutes } from './src/ai/chat-routes.js'

// =============================================================================
// DO Manifest — declares all Durable Objects for dynamic deploy bindings
// =============================================================================

export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'AppRecordRoom', sqlite: true },
  { binding: 'YJS_ROOMS', className: 'AppYjsRoom', sqlite: true },
  { binding: 'CANVAS_ROOMS', className: 'AppCanvasRoom', sqlite: true },
  { binding: 'PRESENCE_ROOMS', className: 'AppPresenceRoom', sqlite: true },
  { binding: 'CRON_ROOMS', className: 'AppCronRoom', sqlite: true },
] as const satisfies DOManifest

// =============================================================================
// Durable Objects — extend to customize behavior
// =============================================================================

export class AppRecordRoom extends RecordRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    // Per-user CRM rooms are named `app:<APP_NAME>:user:<userId>`.
    // For those, the room owner is the user whose data lives in this
    // DO instance — that's how schema-level `owner: { ... }` permissions
    // work out to "only this user can access their own CRM".
    //
    // Any other room name (legacy single-room app, or future shared
    // workspace/dir/conv scopes) falls back to env.OWNER_USER_ID, the
    // app owner, matching the original scaffold behavior.
    const name = state.id.name ?? ''
    const perUser = /^app:[^:]+:user:(.+)$/.exec(name)
    const ownerUserId = perUser?.[1] ?? env.OWNER_USER_ID
    super(state, env, schemas, { ownerUserId })
  }
}

export class AppYjsRoom extends YjsRoom<Env> {}
export class AppCanvasRoom extends CanvasRoom<Env> {}
export class AppPresenceRoom extends PresenceRoom<Env> {}

/**
 * AppCronRoom — runs scheduled tasks defined in src/cron.ts.
 *
 * Tasks are configured at construction time. The DO alarm fires at the
 * next interval / cron-expression match, calls `onTask(name)`, and
 * records the execution in its `cron_history` table. Admin clients can
 * watch via the `useCronMonitor('app:<APP_ID>')` hook.
 */
export class AppCronRoom extends CronRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tasks: cronTasks })
  }

  protected async onTask(taskName: string): Promise<void> {
    await runCronTask(taskName, this.env)
  }
}

// =============================================================================
// Types
// =============================================================================

export interface Env extends DOBindings<typeof __DO_MANIFEST__> {
  ASSETS: Fetcher
  FILES: R2Bucket
  /**
   * Upstream platform-worker. In production this is a [[services]] binding;
   * in `deepspace dev` the binding is absent and the helper falls back to
   * `PLATFORM_WORKER_URL` (written into .dev.vars by the CLI).
   */
  PLATFORM_WORKER?: Fetcher
  PLATFORM_WORKER_URL?: string
  /**
   * HMAC token identifying this app to the platform (minted at deploy time;
   * `deepspace dev` fetches it into .dev.vars). Absent until the app's first
   * deploy registers it — identity headers are only attached when set, so
   * pre-deploy calls fail closed with the upstream's "missing app identity"
   * error instead of a misleading "invalid token" one (an undefined binding
   * coerces to the header string "undefined", which reads as tampered).
   */
  APP_IDENTITY_TOKEN?: string
  /**
   * Upstream api-worker. Same pattern as PLATFORM_WORKER above —
   * binding in prod, URL fallback in dev.
   */
  API_WORKER?: Fetcher
  API_WORKER_URL?: string
  AUTH_JWT_PUBLIC_KEY: string
  AUTH_JWT_ISSUER: string
  AUTH_WORKER_URL: string
  APP_NAME: string
  /** Immutable app id — record scope + platform identity key to this. */
  DEEPSPACE_APP_ID: string
  OWNER_USER_ID: string
  /**
   * Long-lived JWT minted for the app owner at deploy time. Server-side
   * code (actions, cron, AI helpers) uses this to authenticate to the
   * api-worker for developer-billed calls — the owner is billed because
   * they are the JWT subject.
   */
  APP_OWNER_JWT: string
  INTERNAL_STORAGE_HMAC_SECRET: string
  /**
   * When set to "true", the app worker exposes /api/debug/* (set-role,
   * sql, query, records, status) by forwarding to the RecordRoom DO's
   * debug handler. Tests need this for role elevation and state cleanup.
   *
   * The CLI writes this to .dev.vars on `deepspace dev`/`deepspace test`
   * but never to production secrets, so deployed apps don't expose
   * debug routes by default.
   */
  ALLOW_DEBUG_ROUTES?: string
}

export type AppContext = { Bindings: Env }

// =============================================================================
// App
// =============================================================================

const app = new Hono<AppContext>()

// CORS — same-origin in production. The CRM SPA, its API, and its
// WebSocket all live under the same origin (e.g. `crm.deep.space` or
// `<name>.app.space`), so we don't actually *need* CORS at all in
// prod. The allowlist exists for two reasons:
//   1. Local dev — Vite serves on http://localhost:5173 while the
//      worker runs on a different port; the CLI rewrites requests
//      via the proxy, but a couple of debug surfaces benefit from an
//      explicit localhost allowance.
//   2. Custom-domain deploys — if the user attaches a custom domain
//      via `deepspace domain attach`, requests originate from there.
//
// Wildcard `Access-Control-Allow-Origin: *` would let any third-party
// site issue authenticated requests against this worker (CSRF surface
// on top of whatever XSS exposure exists elsewhere). The function
// form below evaluates the request's Origin and returns either the
// matched origin or null (= block).
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return null
    // Same-origin / curl etc. (no Origin header) → null is safe.
    // Browsers omit Origin for top-level navigations and same-origin.
    const u = (() => { try { return new URL(origin) } catch { return null } })()
    if (!u) return null
    // Allow http://localhost:* for `deepspace dev`.
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return origin
    }
    // Allow the deployed app's own subdomain (and any future custom
    // domain pointed at this worker — same trust boundary).
    if (u.hostname.endsWith('.app.space') || u.hostname.endsWith('.deep.space')) {
      return origin
    }
    return null
  },
  credentials: true,
  allowHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}))

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

async function resolveAuth(req: Request, env: Env): Promise<VerifyResult | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return (await verifyJwt(jwtConfig(env), token)).result
}

/**
 * Re-assert this app's identity headers on a proxied request, fail-closed.
 * Never forwards caller-supplied identity; attaches ours only when the app
 * has a token (absent pre-first-deploy — see Env.APP_IDENTITY_TOKEN).
 */
function reassertAppIdentity(headers: Headers, env: Env): void {
  headers.delete('x-app-identity-token')
  headers.delete('x-app-id')
  headers.delete('x-app-name')
  if (!env.APP_IDENTITY_TOKEN) return
  headers.set('x-app-identity-token', env.APP_IDENTITY_TOKEN)
  headers.set('x-app-id', env.DEEPSPACE_APP_ID)
}

// ---------------------------------------------------------------------------
// Social OAuth redirect + code exchange
// ---------------------------------------------------------------------------

app.get('/api/auth/social-redirect', (c) => {
  const provider = c.req.query('provider')
  if (!provider) return c.json({ error: 'Missing provider' }, 400)

  const appOrigin = new URL(c.req.url).origin
  const authOrigin = new URL(c.env.AUTH_WORKER_URL).origin

  return c.redirect(
    `${authOrigin}/login/social?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(appOrigin)}`,
  )
})

app.get('/api/auth/oauth-complete', async (c) => {
  const code = c.req.query('code')
  const appOrigin = new URL(c.req.url).origin

  if (!code) return c.redirect(appOrigin)

  const res = await authWorkerFetch(c.env, '/api/auth/exchange-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) return c.redirect(appOrigin)
  const data = (await res.json()) as { sessionToken?: string }
  if (!data.sessionToken) return c.redirect(appOrigin)
  const sessionToken = data.sessionToken

  return new Response(null, {
    status: 302,
    headers: {
      Location: appOrigin,
      'Set-Cookie': `__Secure-better-auth.session_token=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  })
})

// ---------------------------------------------------------------------------
// Auth proxy → auth-worker (same-origin cookies)
// ---------------------------------------------------------------------------

app.all('/api/auth/*', async (c) => {
  const url = new URL(c.req.url)
  const res = await authWorkerFetch(c.env, url.pathname + url.search, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })
  const headers = new Headers(res.headers)
  const setCookie = headers.get('set-cookie')
  if (setCookie) {
    headers.set('set-cookie', setCookie.replace(/;\s*Domain=[^;]*/gi, ''))
  }
  return new Response(res.body, { status: res.status, headers })
})

// ---------------------------------------------------------------------------
// Debug proxy → app's RecordRoom DO
//
// Forwards /api/debug/* (set-role, sql, query, records, user-role, status)
// to the DO's debug handler. The DO ships these endpoints unconditionally,
// so we gate the proxy on env.ALLOW_DEBUG_ROUTES === "true". The CLI
// writes that env var to .dev.vars on `deepspace dev`/`deepspace test`,
// never to deploy secrets — so production apps return 404 here.
// ---------------------------------------------------------------------------

app.all('/api/debug/*', async (c) => {
  if (c.env.ALLOW_DEBUG_ROUTES !== 'true') {
    return c.notFound()
  }
  const stub = c.env.RECORD_ROOMS.get(c.env.RECORD_ROOMS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`))
  // Forward verbatim, preserving method, headers, body, and the full URL
  // (the DO's debug handler dispatches on url.pathname).
  return stub.fetch(c.req.raw)
})

// ---------------------------------------------------------------------------
// Integrations proxy → api-worker
// ---------------------------------------------------------------------------

app.get('/api/integrations', async (c) => {
  try {
    const res = await apiWorkerFetch(c.env, '/api/integrations')
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Failed to fetch integration catalog' }, 502)
  }
})

// OAuth: per-user connection status. Always user-billed — must forward caller's JWT.
app.get('/api/integrations/status', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  try {
    const res = await apiWorkerFetch(c.env, '/api/integrations/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Status proxy failed' }, 502)
  }
})

// OAuth: disconnect a provider for the calling user. Always user-billed.
app.delete('/api/integrations/oauth/:provider/disconnect', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  const provider = c.req.param('provider')
  try {
    const res = await apiWorkerFetch(
      c.env,
      `/api/integrations/oauth/${encodeURIComponent(provider)}/disconnect`,
      {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Disconnect proxy failed' }, 502)
  }
})

app.all('/api/integrations/:name/:endpoint', async (c) => {
  const integrationName = c.req.param('name')
  const billingMode = integrations[integrationName]?.billing ?? 'developer'

  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth && billingMode === 'user') {
    return c.json({ error: 'Sign in required for this integration' }, 401)
  }

  const target = `/api/integrations/${integrationName}/${c.req.param('endpoint')}`

  const headers: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') ?? 'application/json',
  }

  // Pick the JWT whose subject is the user we want billed:
  //   - developer-billed → the app owner (via APP_OWNER_JWT)
  //   - user-billed      → the caller (forward their Bearer token)
  // The api-worker bills the JWT subject; it does not accept any
  // client-supplied billing override.
  if (billingMode === 'developer') {
    headers['Authorization'] = `Bearer ${c.env.APP_OWNER_JWT}`
  } else {
    const token = c.req.header('Authorization')?.slice(7)
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  // Identify this app to the api-worker (HMAC-verified) so integrations that
  // scope per app (e.g. Composio connections) isolate this app from others.
  // Pre-first-deploy there is no token yet — send nothing so the api-worker
  // answers 400 missing_app_identity rather than 401 for a garbage token.
  if (c.env.APP_IDENTITY_TOKEN) {
    headers['x-app-identity-token'] = c.env.APP_IDENTITY_TOKEN
    headers['x-app-id'] = c.env.DEEPSPACE_APP_ID
  }

  const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
  const body = hasBody ? await c.req.text() : undefined

  try {
    const res = await apiWorkerFetch(c.env, target, {
      method: c.req.method,
      headers,
      body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Integration proxy failed' }, 502)
  }
})

// ---------------------------------------------------------------------------
// WebSocket routes
// ---------------------------------------------------------------------------

// The DO reads identity (userId, userName, userEmail, userImageUrl, role)
// off the URL it receives and trusts it. Anything the client put on the URL
// is stripped on every code path; identity is re-applied only from a
// verified JWT. Three states: no token = anonymous (the SDK's
// allowAnonymous flow), invalid token = 401, valid token = JWT identity.
function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraParams?: (auth: VerifyResult) => Record<string, string>,
) {
  return async (c: any) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')

    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }

    const doUrl = new URL(c.req.url)
    doUrl.searchParams.delete('token')
    for (const k of ['userId', 'userName', 'userEmail', 'userImageUrl', 'role']) {
      doUrl.searchParams.delete(k)
    }

    if (auth) {
      doUrl.searchParams.set('userId', auth.userId)
      if (auth.claims.name) doUrl.searchParams.set('userName', auth.claims.name)
      if (auth.claims.email) doUrl.searchParams.set('userEmail', auth.claims.email)
      if (auth.claims.image) doUrl.searchParams.set('userImageUrl', auth.claims.image)
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams(auth))) {
          doUrl.searchParams.set(k, v)
        }
      }
    }

    const ns = doNamespace(c.env)
    const stub = ns.get(ns.idFromName(id))
    return stub.fetch(new Request(doUrl.toString(), c.req.raw))
  }
}

app.get(
  '/ws/:roomId',
  wsRoute((env) => env.RECORD_ROOMS),
)

app.get(
  '/ws/yjs/:docId',
  wsRoute(
    (env) => env.YJS_ROOMS,
    () => ({ role: 'member' }),
  ),
)

app.get(
  '/ws/canvas/:docId',
  wsRoute(
    (env) => env.CANVAS_ROOMS,
    () => ({ role: 'member' }),
  ),
)

app.get(
  '/ws/presence/:scopeId',
  wsRoute(
    (env) => env.PRESENCE_ROOMS,
    (auth) => ({
      ...(auth.claims.name ? { userName: auth.claims.name } : {}),
      ...(auth.claims.email ? { userEmail: auth.claims.email } : {}),
      ...(auth.claims.image ? { userImageUrl: auth.claims.image } : {}),
    }),
  ),
)

app.get(
  '/ws/cron/:roomId',
  wsRoute((env) => env.CRON_ROOMS),
)

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

app.post('/api/actions/:name', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const name = c.req.param('name')
  const action = actions[name]
  if (!action) return c.json({ error: 'Action not found' }, 404)
  const params = await c.req.json<Record<string, unknown>>()
  const callerJwt = c.req.header('Authorization')!.slice(7)
  const tools = createActionTools(c.env, auth.userId, callerJwt)
  const result = await action({ userId: auth.userId, params, tools, env: c.env, callerJwt })
  return c.json(result as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// AI chat — multi-turn tool-use via Vercel AI SDK + DeepSpace proxy
// ---------------------------------------------------------------------------

// Routes implementation lives in `src/ai/chat-routes.ts` to keep this file
// focused on app-level wiring. `resolveAuth` is passed in to avoid a runtime
// circular import (chat-routes imports `Env`/`AppContext` as types only).
registerAiChatRoutes(app, resolveAuth)

// ---------------------------------------------------------------------------
// Scoped R2 files → platform-worker
// ---------------------------------------------------------------------------

app.all('/api/files/*', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  const userId = auth?.userId ?? null

  const url = new URL(c.req.url)
  const platformUrl = new URL(c.req.url)
  platformUrl.pathname = url.pathname.replace('/api/files', '/internal/files')

  const headers = new Headers(c.req.raw.headers)
  // Strip any caller-supplied user id before conditionally re-adding the
  // verified one — the platform trusts this header (it arrives with our HMAC
  // identity token) to scope `?scope=self` keys, so a spoofed passthrough
  // would let an unauthenticated browser read another user's files.
  headers.delete('x-user-id')
  reassertAppIdentity(headers, c.env)
  if (userId) headers.set('x-user-id', userId)

  const resp = await platformWorkerFetch(
    c.env,
    new Request(platformUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    }),
  )

  // Rewrite URLs in JSON responses to use the app's origin
  const contentType = resp.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await resp.json()) as Record<string, unknown>
    const rewriteUrl = (u: string) => u.replace(/^https?:\/\/[^/]+/, url.origin)
    if (typeof body.url === 'string') body.url = rewriteUrl(body.url)
    if (Array.isArray(body.files)) {
      for (const f of body.files as Array<Record<string, unknown>>) {
        if (typeof f.url === 'string') f.url = rewriteUrl(f.url)
      }
    }
    return c.json(body, resp.status as any)
  }

  return new Response(resp.body, { status: resp.status, headers: resp.headers })
})

// ---------------------------------------------------------------------------
// /_deepspace/* — same-origin proxy to api-worker for authenticated SDK
// hooks. Attaches APP_IDENTITY_TOKEN + the app id so the browser never sees
// the platform secret. Every request requires a signed user JWT.
//
// SECURITY: exact (method, path) allowlist — not a prefix match. A prefix
// match leaks deploy/CLI surfaces like POST /api/subscriptions/sync into the
// browser context, where an XSS or compromised user session can become a
// confused deputy. Adding a new browser hook in the SDK requires explicitly
// extending the BROWSER_PROXY_ROUTES tuple below.
// ---------------------------------------------------------------------------

interface ProxyRoute {
  method: string
  path: string
}

const BROWSER_PROXY_ROUTES: ReadonlyArray<ProxyRoute> = [
  // useSubscription — read state, subscribe, manage billing.
  { method: 'GET',  path: '/_deepspace/subscriptions/me' },
  { method: 'POST', path: '/_deepspace/subscriptions/checkout' },
  { method: 'POST', path: '/_deepspace/subscriptions/portal' },
  // useCheckout (one-time charges)
  { method: 'POST', path: '/_deepspace/charges/create' },
  { method: 'GET',  path: '/_deepspace/charges/me' },
]

app.all('/_deepspace/*', async (c) => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const route = BROWSER_PROXY_ROUTES.find(
    (r) => r.method === method && r.path === url.pathname,
  )
  if (!route) {
    return c.json({ error: 'not_found' }, 404)
  }

  // Every proxied route requires a signed-in user.
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth?.userId) return c.json({ error: 'unauthorized' }, 401)

  // OVERWRITE any caller-supplied appId — a request to
  // `/_deepspace/subscriptions/plans?appId=other_app` must never reach the
  // platform with someone else's id.
  const forwardedParams = new URLSearchParams(url.search)
  forwardedParams.set('appId', c.env.DEEPSPACE_APP_ID)
  const queryString = forwardedParams.toString()
  const apiPath =
    url.pathname.replace('/_deepspace/', '/api/') + (queryString ? `?${queryString}` : '')

  const headers = new Headers(c.req.raw.headers)
  headers.delete('x-user-id')
  reassertAppIdentity(headers, c.env)
  if (auth?.userId) headers.set('x-user-id', auth.userId)

  return apiWorkerFetch(c.env, apiPath, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
  })
})

// ---------------------------------------------------------------------------
// Static assets (SPA fallback)
// ---------------------------------------------------------------------------

app.get('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status === 404) {
    const url = new URL(c.req.url)
    url.pathname = '/index.html'
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
  }
  return response
})

// =============================================================================
// Action Tools — route to app's own RecordRoom DO
// =============================================================================

function createActionTools(env: Env, userId: string, callerJwt: string): ActionTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))

  // Internal helper — DO returns `ActionResult<unknown>`. Callers below
  // cast to the precisely-typed result for each operation. The cast is
  // safe because the wire shape is set by the SDK's tools-api handler.
  async function execTool<TData>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult<TData>> {
    const res = await stub.fetch(new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool, params }),
    }))
    return res.json() as Promise<ActionResult<TData>>
  }

  async function callIntegration<T>(
    endpoint: string,
    data?: unknown,
  ): Promise<ActionResult<T>> {
    const integrationName = endpoint.split('/')[0]
    const billingMode = integrations[integrationName]?.billing ?? 'developer'

    // Use the owner JWT for developer-billed calls, the caller's JWT otherwise.
    // The api-worker bills the JWT subject — no client-supplied override.
    const jwt = billingMode === 'developer' ? env.APP_OWNER_JWT : callerJwt

    const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(data ?? {}),
    })
    return res.json() as Promise<ActionResult<T>>
  }

  return {
    create: (collection, data, recordId) =>
      execTool('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) =>
      execTool('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => execTool('records.delete', { collection, recordId }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration: callIntegration,
    registerUser: (opts) => execTool('users.register', { ...opts }),
  }
}

export default app
