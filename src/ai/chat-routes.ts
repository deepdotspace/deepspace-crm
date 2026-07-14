/**
 * AI chat routes — multi-turn tool-use via Vercel AI SDK + DeepSpace proxy.
 *
 * Registers four endpoints on the passed-in Hono app:
 *   POST   /api/ai/chats       — create a chat owned by the caller
 *   PATCH  /api/ai/chats/:id   — rename / patch a chat
 *   DELETE /api/ai/chats/:id   — delete chat + cascade messages
 *   POST   /api/ai/chat        — streamed assistant turn (the big one)
 *
 * Lives in its own file so worker.ts can stay small and the streaming
 * handler's full context (compaction, tools, persistence, abort handling)
 * is co-located rather than scattered through the entry file.
 */

import type { Hono } from 'hono'
import { streamText, stepCountIs } from 'ai'
import type { ModelMessage } from 'ai'
import {
  createDeepSpaceAI,
  prepareMessagesWithCompaction,
  turnsToCoreMessages,
  buildUiParts,
  makeDefaultSummarizer,
  capToolResultSize,
  DEFAULT_CONTEXT_CONFIG,
  getChat,
  createChat,
  updateChat,
  deleteChatCascade,
  loadMessages,
  appendMessage,
} from 'deepspace/worker'
import type { ChatTurn, VerifyResult } from 'deepspace/worker'
import { schemas } from '../schemas.js'
import { buildSystemPrompt, buildTools } from './tools.js'
// Type-only — TypeScript strips these at runtime, so no circular import
// with worker.ts (which imports `registerAiChatRoutes` from this file).
import type { Env, AppContext } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

// Allowlist of models the client may select. Keeps a malicious or stale
// `modelId` from hitting the fallback pricing tier. Add models here as you
// expose them in the UI.
const ALLOWED_MODELS: Record<string, 'anthropic' | 'openai' | 'cerebras'> = {
  'claude-opus-4-7':    'anthropic',
  'claude-sonnet-4-6':  'anthropic',
  'claude-haiku-4-5':   'anthropic',
  'gpt-5.4':            'openai',
  'gpt-5.4-mini':       'openai',
  'gpt-5.4-nano':       'openai',
  'gpt-oss-120b':       'cerebras',
}
const DEFAULT_MODEL = 'claude-sonnet-4-6'

function recordRoomStub(env: Env): DurableObjectStub {
  return env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
}

// Cap on user-supplied content length. Blocks accidental DoS via megabyte payloads.
const MAX_USER_CONTENT_LENGTH = 100_000

function deriveTitle(content: string): string {
  const first = content.trim().split('\n').map((l) => l.trim()).find(Boolean) ?? 'Untitled'
  return first.length <= 50 ? first : first.slice(0, 47).trimEnd() + '…'
}

/** Redact a userId for logs — keep the last 4 chars so traces are still
 *  correlatable without exposing the full identifier in worker logs. */
function redactUserId(id: string): string {
  if (id.length <= 4) return '****'
  return `***${id.slice(-4)}`
}

export function registerAiChatRoutes(
  app: Hono<AppContext>,
  resolveAuth: ResolveAuth,
): void {
  app.post('/api/ai/chats', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))
    const stub = recordRoomStub(c.env)
    const chat = await createChat(stub, auth.userId, {
      title: body.title ?? 'New chat',
    })
    return c.json({ chat })
  })

  app.patch('/api/ai/chats/:id', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, id, auth.userId)
    if (!chat) return c.json({ error: 'Not found' }, 404)

    const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))
    const patch: { title?: string } = {}
    if (typeof body.title === 'string') patch.title = body.title
    await updateChat(stub, id, auth.userId, patch)
    return c.json({ ok: true })
  })

  app.delete('/api/ai/chats/:id', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, id, auth.userId)
    if (!chat) return c.json({ error: 'Not found' }, 404)

    await deleteChatCascade(stub, id, auth.userId)
    return c.json({ ok: true })
  })

  app.post('/api/ai/chat', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const authHeader = c.req.header('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return c.json({ error: 'Unauthorized' }, 401)

    const { chatId, userMessageId, content, modelId } = await c.req.json<{
      chatId?: string
      userMessageId?: string
      content?: string
      modelId?: string
    }>()
    if (typeof chatId !== 'string' || !chatId) return c.json({ error: 'chatId is required' }, 400)
    if (typeof userMessageId !== 'string' || !userMessageId) return c.json({ error: 'userMessageId is required' }, 400)
    if (typeof content !== 'string' || content.trim() === '') return c.json({ error: 'content is required' }, 400)
    if (content.length > MAX_USER_CONTENT_LENGTH) {
      return c.json({ error: `content exceeds ${MAX_USER_CONTENT_LENGTH} chars` }, 413)
    }
    if (modelId !== undefined && !ALLOWED_MODELS[modelId]) {
      return c.json({ error: `Unknown modelId: ${modelId}` }, 400)
    }

    const stub = recordRoomStub(c.env)
    const chat = await getChat(stub, chatId, auth.userId)
    if (!chat) {
      console.warn('[ai-chat] REQUEST chat-not-found', { userId: redactUserId(auth.userId), chatId })
      return c.json({ error: 'Chat not found' }, 404)
    }

    const history = await loadMessages(stub, chatId, auth.userId)
    const rawTurns: ChatTurn[] = history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts,
    }))

    const allTurns: ChatTurn[] = [...rawTurns, { id: userMessageId, role: 'user', content }]
    const turns: ChatTurn[] = []
    for (let i = 0; i < allTurns.length; i++) {
      if (allTurns[i].role === 'user' && allTurns[i + 1]?.role === 'user') continue
      turns.push(allTurns[i])
    }

    const cachedSummary = chat.compactedSummary && chat.compactedThroughId
      ? { text: chat.compactedSummary, throughId: chat.compactedThroughId }
      : undefined

    const summarizer = makeDefaultSummarizer(c.env, { authToken: jwt })
    const { messages: prepared, newSummary } = await prepareMessagesWithCompaction(
      turns,
      DEFAULT_CONTEXT_CONFIG,
      { summarizer, cachedSummary },
    )
    if (newSummary) {
      await updateChat(stub, chatId, auth.userId, {
        compactedSummary: newSummary.text,
        compactedThroughId: newSummary.throughId,
      })
    }

    const usedModelId = modelId ?? DEFAULT_MODEL
    const ai = createDeepSpaceAI(c.env, ALLOWED_MODELS[usedModelId], { authToken: jwt })
    const baseSystem = buildSystemPrompt(c.env.APP_NAME, schemas)

    const [first, ...rest] = prepared
    const summary = first?.role === 'system' ? first : null
    const systemText = summary ? `${baseSystem}\n\n${summary.content}` : baseSystem
    const messages = turnsToCoreMessages(summary ? rest : prepared)

    const tools = buildTools(async (toolName, params) => {
      const res = await stub.fetch(new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': auth.userId,
        },
        body: JSON.stringify({ tool: toolName, params }),
        signal: c.req.raw.signal,
      }))
      const raw = await res.json()
      return capToolResultSize(raw, DEFAULT_CONTEXT_CONFIG.toolResultCap)
    })

    const asstId = `asst-${Date.now()}-${crypto.randomUUID()}`

    const result = streamText({
      model: ai(usedModelId),
      system: systemText,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      abortSignal: c.req.raw.signal,
      onError: ({ error }) => {
        console.error('[ai-chat] streamText error:', error)
      },
      onFinish: async ({ text, response }) => {
        const parts = buildUiParts(response.messages as ModelMessage[])
        if (text.trim() === '' && parts.length === 0) {
          console.warn('[ai-chat] FINISH empty turn, skipping persist')
          return
        }

        const writeWithRetry = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
          try { await fn(); return true } catch (err) {
            console.error(`[ai-chat] ${label} failed, retrying once:`, err)
            try { await fn(); return true } catch (retryErr) {
              console.error(`[ai-chat] ${label} retry failed:`, retryErr)
              return false
            }
          }
        }

        const userOk = await writeWithRetry('user message', () => appendMessage(stub, {
          id: userMessageId,
          chatId,
          userId: auth.userId,
          role: 'user',
          content,
        }))
        if (!userOk) {
          console.error('[ai-chat] FINISH aborting — user write failed; skipping assistant + metadata to avoid orphan rows')
          return
        }
        await writeWithRetry('assistant message', () => appendMessage(stub, {
          id: asstId,
          chatId,
          userId: auth.userId,
          role: 'assistant',
          content: text,
          ...(parts.length > 0 ? { parts } : {}),
        }))
        await writeWithRetry('chat metadata', async () => {
          const fresh = await getChat(stub, chatId, auth.userId)
          const patch: { title?: string; model?: string } = { model: usedModelId }
          if (fresh && (!fresh.title || fresh.title === 'New chat')) {
            patch.title = deriveTitle(content)
          }
          await updateChat(stub, chatId, auth.userId, patch)
        })
      },
    })

    return result.toUIMessageStreamResponse({
      headers: {
        'X-Asst-Id': asstId,
      },
      sendReasoning: false,
      onError: (error: unknown): string => {
        console.error('[ai-chat] response error:', error)
        return error instanceof Error ? error.message : String(error)
      },
    })
  })
}
