// Node 20 lacks a native global WebSocket constructor, which the
// @supabase/realtime-js client requires at instantiation. Polyfill from
// the `ws` package so the Supabase server client can initialize.
// Safe to remove once we move to Node 22+.
import { WebSocket as WsWebSocket } from 'ws'

export default defineNitroPlugin(() => {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
    (globalThis as { WebSocket?: unknown }).WebSocket = WsWebSocket
  }
})
