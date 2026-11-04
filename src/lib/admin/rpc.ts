import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminRpc } from "@/lib/api/rpc.functions";
import { decodeError, type AppErrorCode } from "@/lib/shared/errors";
import { supabase } from "@/integrations/supabase/client";

export class RpcError extends Error {
  code: AppErrorCode;
  details?: unknown;
  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function rpc<T = any>(op: string, input?: unknown): Promise<T> {
  try {
    return (await adminRpc({ data: { op, input: input ?? {} } })) as T;
  } catch (err) {
    const d = decodeError(err);
    throw new RpcError(d.code, d.message, d.details);
  }
}

export function useRpc<T = any>(
  op: string,
  input?: unknown,
  opts: Partial<UseQueryOptions<T, RpcError>> = {},
) {
  return useQuery<T, RpcError>({
    queryKey: [op, input ?? {}],
    queryFn: () => rpc<T>(op, input),
    staleTime: 15_000,
    retry: (n, e) => n < 1 && e.code === "INTERNAL",
    ...opts,
  });
}

/** Mutation with toast feedback and cache invalidation by op-name prefix. */
export function useRpcMutation<T = any, V = unknown>(
  op: string,
  opts: {
    invalidate?: string[];
    success?: string | ((r: T) => string | null);
    onSuccess?: (r: T, v: V) => void;
    silentError?: boolean;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation<T, RpcError, V>({
    mutationFn: (vars: V) => rpc<T>(op, vars),
    onSuccess: (r, v) => {
      for (const p of opts.invalidate ?? [])
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(p) });
      const msg = typeof opts.success === "function" ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silentError) toast.error(e.message);
    },
  });
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Multipart upload to /api/admin/upload with the current session token. */
export async function uploadFile(
  target: "media" | "document",
  file: File,
  extra: Record<string, string> = {},
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new RpcError("UNAUTHENTICATED", "Please sign in again.");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target", target);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: AppErrorCode;
  } & Record<string, any>;
  if (!res.ok || !json.ok)
    throw new RpcError(json.code ?? "INTERNAL", json.error ?? "Upload failed");
  return json;
}

export const fmtDate = (v: unknown) =>
  v
    ? new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
export const fmtDateTime = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
export const toLocalInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
