"use client";

import { queryClient } from "@/lib/query-client";
import { useMessagesStore } from "@/lib/store/messages";
import { usePresenceStore } from "@/lib/store/presence";
import { toast } from "sonner";
import type {
  MemberUpdatePayload,
  MessageAckPayload,
  MessageNewPayload,
  MessageReadPayload,
  MessageSendPayload,
  PresencePayload,
  ReactionTogglePayload,
  ReactionUpdatePayload,
  ReceiptUpdatePayload,
  TypingEventPayload,
  TypingPayload,
  WsEnvelope,
} from "@/lib/types";

export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

type ConnectionListener = (connected: boolean) => void;

let socket: WebSocket | null = null;
let currentToken: string | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let deliberatelyClosed = false;
let selfUserId: number | null = null;
const connectionListeners = new Set<ConnectionListener>();
/** Frames queued while the socket is connecting/reconnecting. */
const sendQueue: WsEnvelope[] = [];

function notifyConnection(connected: boolean) {
  connectionListeners.forEach((l) => l(connected));
}

export function onConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function connectWs(token: string, userId: number) {
  if (socket && currentToken === token && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  currentToken = token;
  selfUserId = userId;
  deliberatelyClosed = false;
  openSocket();
}

function openSocket() {
  if (!currentToken) return;
  const url = `${WS_BASE}/ws?token=${encodeURIComponent(currentToken)}`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    notifyConnection(true);
    while (sendQueue.length) {
      const frame = sendQueue.shift()!;
      ws.send(JSON.stringify(frame));
    }
  };

  ws.onmessage = (event) => {
    try {
      const envelope = JSON.parse(event.data) as WsEnvelope;
      dispatchServerEvent(envelope);
    } catch (err) {
      console.error("ws: failed to parse message", err);
    }
  };

  ws.onclose = () => {
    notifyConnection(false);
    if (socket === ws) socket = null;
    if (!deliberatelyClosed) scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 15_000);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!deliberatelyClosed) openSocket();
  }, delay);
}

export function disconnectWs() {
  deliberatelyClosed = true;
  currentToken = null;
  selfUserId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
  sendQueue.length = 0;
}

export function isWsConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

function send(envelope: WsEnvelope) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(envelope));
  } else {
    sendQueue.push(envelope);
  }
}

// ---------- typed send helpers ----------

export function sendMessage(payload: MessageSendPayload) {
  send({ type: "message.send", payload });
}

export function sendTypingStart(payload: TypingPayload) {
  send({ type: "typing.start", payload });
}

export function sendTypingStop(payload: TypingPayload) {
  send({ type: "typing.stop", payload });
}

export function sendMessageRead(payload: MessageReadPayload) {
  send({ type: "message.read", payload });
}

export function sendReactionAdd(payload: ReactionTogglePayload) {
  send({ type: "reaction.add", payload });
}

export function sendReactionRemove(payload: ReactionTogglePayload) {
  send({ type: "reaction.remove", payload });
}

// ---------- server -> client dispatch ----------

function dispatchServerEvent(envelope: WsEnvelope) {
  switch (envelope.type) {
    case "message.new": {
      const payload = envelope.payload as MessageNewPayload;
      useMessagesStore.getState().receiveNew(payload);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (payload.sender_id !== selfUserId) {
        const isFocused = typeof document !== "undefined" && document.visibilityState === "visible";
        if (!isFocused) {
          toast(payload.content ?? "New message", { description: "New message received" });
        }
      }
      break;
    }
    case "message.ack": {
      const payload = envelope.payload as MessageAckPayload;
      useMessagesStore.getState().ackMessage(payload);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      break;
    }
    case "receipt.update": {
      const payload = envelope.payload as ReceiptUpdatePayload;
      useMessagesStore.getState().applyReceipt(payload);
      break;
    }
    case "typing": {
      const payload = envelope.payload as TypingEventPayload;
      usePresenceStore.getState().setTyping(payload);
      break;
    }
    case "presence": {
      const payload = envelope.payload as PresencePayload;
      usePresenceStore.getState().setPresence(payload);
      break;
    }
    case "reaction.update": {
      const payload = envelope.payload as ReactionUpdatePayload;
      useMessagesStore.getState().updateReactions(payload);
      break;
    }
    case "member.update": {
      const payload = envelope.payload as MemberUpdatePayload;
      queryClient.invalidateQueries({ queryKey: ["conversation", payload.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (payload.event === "added") toast.info(`${payload.member.user?.display_name ?? "Someone"} was added`);
      if (payload.event === "removed") toast.info(`${payload.member.user?.display_name ?? "Someone"} was removed`);
      break;
    }
    default:
      break;
  }
}

/** Generates a client-local optimistic id (docs/DESIGN.md §2 `temp_id`). */
export function makeTempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
