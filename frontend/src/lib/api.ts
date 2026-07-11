"use client";

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/auth";
import type {
  Conversation,
  ConversationSummary,
  CompleteProfileIn,
  CreateConversationIn,
  Message,
  RequestOtpIn,
  RequestOtpOut,
  TokenOut,
  User,
  UploadOut,
  MemberRole,
  ConversationMember,
  ConversationMediaOut,
  ContactInfo,
  UpdateContactIn,
} from "@/lib/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Resolve a media path (attachment/avatar) to an absolute URL. The backend
 * serves uploads at `${API_BASE}/uploads/...` (a relative path from the API),
 * which would otherwise resolve against the frontend origin and 404.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> {
  const { auth = true, headers, ...rest } = init ?? {};
  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };

  const isFormData = rest.body instanceof FormData;
  if (!isFormData && rest.body) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = useAuthStore.getState().token;
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail ?? body.message ?? message;
    } catch {
      // ignore
    }
    if (res.status === 401) {
      useAuthStore.getState().logout();
    }
    throw new ApiError(res.status, typeof message === "string" ? message : JSON.stringify(message));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Auth ----------

export async function requestOtp(body: RequestOtpIn) {
  return apiFetch<RequestOtpOut>("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify(body),
    auth: false,
  });
}

export async function verifyOtp(phone: string, code: string) {
  return apiFetch<TokenOut>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
    auth: false,
  });
}

export async function completeProfile(body: CompleteProfileIn) {
  return apiFetch<{ user: User }>("/auth/complete-profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchMe() {
  return apiFetch<{ user: User } | User>("/auth/me");
}

export async function logoutRequest() {
  return apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

// ---------- Users ----------

export function useSearchUsers(q: string) {
  return useQuery({
    queryKey: ["users", "search", q],
    queryFn: () => apiFetch<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
}

export async function patchMe(patch: { display_name?: string; about?: string; avatar_url?: string }) {
  return apiFetch<{ user: User }>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function getUser(id: number) {
  return apiFetch<User>(`/users/${id}`);
}

export function useUser(id: number | null) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id as number),
    enabled: id != null,
  });
}

// ---------- Conversations ----------

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<ConversationSummary[]>("/conversations"),
    refetchOnWindowFocus: false,
  });
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<Conversation>(`/conversations/${id}`),
    enabled: id != null,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConversationIn) =>
      apiFetch<Conversation>("/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function usePatchConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { name?: string; avatar_url?: string } }) =>
      apiFetch<Conversation>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}

// ---------- Messages (history + REST fallback send) ----------

export const HISTORY_PAGE_SIZE = 30;

export function useMessageHistory(conversationId: number | null) {
  return useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: async ({ pageParam }: { pageParam: number | undefined }) => {
      const qs = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
      if (pageParam) qs.set("before", String(pageParam));
      return apiFetch<Message[]>(`/conversations/${conversationId}/messages?${qs.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length === HISTORY_PAGE_SIZE ? lastPage[lastPage.length - 1]?.id : undefined,
    enabled: conversationId != null,
    refetchOnWindowFocus: false,
  });
}

export async function sendMessageRest(body: {
  conversation_id: number;
  content: string;
  reply_to_id?: number | null;
}) {
  return apiFetch<Message>("/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- Uploads ----------

export async function uploadAttachment(file: File): Promise<UploadOut> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<UploadOut>("/uploads", {
    method: "POST",
    body: form,
  });
}

// ---------- Group membership ----------

export function useAddMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, userIds }: { conversationId: number; userIds: number[] }) =>
      apiFetch<{ members: ConversationMember[] }>(`/conversations/${conversationId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_ids: userIds }),
      }),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) =>
      apiFetch<{ ok: boolean }>(`/conversations/${conversationId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      userId,
      role,
    }: {
      conversationId: number;
      userId: number;
      role: MemberRole;
    }) =>
      apiFetch<{ member: ConversationMember }>(`/conversations/${conversationId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });
}

export function useLeaveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) =>
      apiFetch<{ ok: boolean }>(`/conversations/${conversationId}/leave`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

// ---------- Media ----------

export function useConversationMedia(id: number | null) {
  return useQuery({
    queryKey: ["conversation-media", id],
    queryFn: () => apiFetch<ConversationMediaOut>(`/conversations/${id}/media`),
    enabled: id != null,
  });
}

// ---------- Disappearing messages ----------

export function usePatchDisappearing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, seconds }: { id: number; seconds: number | null }) =>
      apiFetch<Conversation>(`/conversations/${id}/disappearing`, {
        method: "PATCH",
        body: JSON.stringify({ seconds }),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

// ---------- Chat color ----------

export function usePatchChatColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, color }: { id: number; color: string | null }) =>
      apiFetch<ConversationMember>(`/conversations/${id}/chat-color`, {
        method: "PATCH",
        body: JSON.stringify({ color }),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}

// ---------- Contacts (nickname / note) ----------

export function useContact(userId: number | null) {
  return useQuery({
    queryKey: ["contact", userId],
    queryFn: () => apiFetch<ContactInfo>(`/contacts/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: number; patch: UpdateContactIn }) =>
      apiFetch<ContactInfo>(`/contacts/${userId}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ["contact", userId] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
