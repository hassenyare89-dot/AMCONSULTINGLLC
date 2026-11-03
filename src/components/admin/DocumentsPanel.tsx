import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DOCUMENT_CATEGORIES, DOCUMENT_SENSITIVITY, labelFor } from "@/lib/shared/domain";
import { fmtDate, rpc, uploadFile, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import {
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  inputCls,
} from "./kit";
import { cn } from "@/lib/utils";

export type Doc = {
  id: string;
  title: string;
  category: string;
  entity_type: string;
  entity_id: string | null;
  sensitivity: string;
  filename: string;
  size_bytes: number;
  version: number;
  is_current: boolean;
  expires_on: string | null;
  scan_status: string;
  created_at: string;
  archived_at: string | null;
};

export async function downloadDocument(id: string) {
  try {
    const { url } = await rpc<{ url: string }>("documents.download", { id });
    window.location.assign(url);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function UploadDocumentForm({
  entityType,
  entityId,
  previous,
  onDone,
}: {
  entityType: string;
  entityId?: string | null;
  previous?: Doc;
  onDone?: () => void;
}) {
  const can = useCan();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({
    title: previous?.title ?? "",
    category:
      previous?.category ??
      (entityType === "truck"
        ? "vehicle_registration"
        : entityType === "project"
          ? "project"
          : "other"),
    sensitivity: previous?.sensitivity ?? "internal",
    expiresOn: "",
    retainUntil: "",
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a file");
    if (!meta.title.trim()) return toast.error("Enter a title");
    setBusy(true);
    try {
      await uploadFile("document", file, {
        meta: JSON.stringify({
          ...meta,
          entityType,
          entityId: entityId ?? "",
          previousVersionId: previous?.id ?? "",
        }),
      });
      toast.success(previous ? "New version uploaded" : "Document uploaded");
      if (fileRef.current) fileRef.current.value = "";
      setMeta((m) => ({ ...m, title: "", expiresOn: "" }));
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("documents.") });
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`doc-file-${entityId}`}>
          File (PDF, image, DOCX, XLSX, CSV, TXT · max 25 MB)
        </Label>
        <input
          id={`doc-file-${entityId}`}
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.csv,.txt"
          className={cn(inputCls, "mt-1")}
          required
        />
      </div>
      <div>
        <Label htmlFor={`doc-title-${entityId}`}>Title</Label>
        <input
          id={`doc-title-${entityId}`}
          className={cn(inputCls, "mt-1")}
          maxLength={200}
          value={meta.title}
          onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor={`doc-cat-${entityId}`}>Category</Label>
        <select
          id={`doc-cat-${entityId}`}
          className={cn(inputCls, "mt-1")}
          value={meta.category}
          onChange={(e) => setMeta({ ...meta, category: e.target.value })}
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`doc-sens-${entityId}`}>Sensitivity</Label>
        <select
          id={`doc-sens-${entityId}`}
          className={cn(inputCls, "mt-1")}
          value={meta.sensitivity}
          onChange={(e) => setMeta({ ...meta, sensitivity: e.target.value })}
        >
          {DOCUMENT_SENSITIVITY.filter(
            (s) => s.value !== "restricted" || can("documents.restricted"),
          ).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`doc-exp-${entityId}`}>Expires on (optional)</Label>
        <input
          id={`doc-exp-${entityId}`}
          type="date"
          className={cn(inputCls, "mt-1")}
          value={meta.expiresOn}
          onChange={(e) => setMeta({ ...meta, expiresOn: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`doc-ret-${entityId}`}>Retain until (optional)</Label>
        <input
          id={`doc-ret-${entityId}`}
          type="date"
          className={cn(inputCls, "mt-1")}
          value={meta.retainUntil}
          onChange={(e) => setMeta({ ...meta, retainUntil: e.target.value })}
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy} className="bg-navy text-white hover:bg-navy/90">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden />
          )}{" "}
          {previous ? "Upload new version" : "Upload"}
        </Button>
      </div>
    </form>
  );
}

export function DocumentList({ docs, showEntity }: { docs: Doc[]; showEntity?: boolean }) {
  const can = useCan();
  const [versionOf, setVersionOf] = useState<Doc | null>(null);
  const archive = useRpcMutation("documents.archive", {
    invalidate: ["documents."],
    success: "Document archived",
  });
  if (!docs.length) return <EmptyState title="No documents" />;
  return (
    <>
      <ul className="divide-y divide-border">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-navy">
                {d.title} <span className="text-xs text-muted-foreground">v{d.version}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {labelFor(DOCUMENT_CATEGORIES, d.category)} · {d.filename} ·{" "}
                {(d.size_bytes / 1024).toFixed(0)} KB · {fmtDate(d.created_at)}
                {showEntity && d.entity_type !== "company"
                  ? ` · ${d.entity_type.replace("_", " ")}`
                  : ""}
                <StatusBadge value={d.sensitivity} />
                {d.expires_on && (
                  <span
                    className={cn(
                      d.expires_on < new Date().toISOString().slice(0, 10) &&
                        "font-semibold text-destructive",
                    )}
                  >
                    Expires {fmtDate(d.expires_on)}
                  </span>
                )}
                {d.scan_status === "not_scanned" && (
                  <span title="Malware scanning is not configured">unscanned</span>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadDocument(d.id)}
                aria-label={`Download ${d.title}`}
              >
                <Download className="h-4 w-4" aria-hidden />
              </Button>
              {can("documents.write") && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVersionOf(versionOf?.id === d.id ? null : d)}
                  >
                    New version
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    title="Archive document?"
                    description="It will be hidden from lists but kept in storage per the retention policy."
                    onConfirm={() => archive.mutateAsync({ id: d.id })}
                  >
                    Archive
                  </ConfirmButton>
                </>
              )}
            </div>
            {versionOf?.id === d.id && (
              <div className="w-full rounded-lg border border-border p-3">
                <UploadDocumentForm
                  entityType={d.entity_type}
                  entityId={d.entity_id}
                  previous={d}
                  onDone={() => setVersionOf(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function DocumentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const can = useCan();
  const [adding, setAdding] = useState(false);
  const q = useRpc<{ documents: Doc[] }>(
    "documents.list",
    { entityType, entityId },
    { enabled: can("documents.read") },
  );
  if (!can("documents.read")) return null;
  return (
    <Panel
      title="Documents"
      actions={
        can("documents.write") && (
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "Upload"}
          </Button>
        )
      }
    >
      {adding && (
        <div className="mb-4 rounded-lg border border-border p-3">
          <UploadDocumentForm
            entityType={entityType}
            entityId={entityId}
            onDone={() => setAdding(false)}
          />
        </div>
      )}
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <DocumentList docs={q.data!.documents} />
      )}
    </Panel>
  );
}
