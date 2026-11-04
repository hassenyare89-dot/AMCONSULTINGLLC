import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, PageHeader, Panel, inputCls } from "@/components/admin/kit";
import { DocumentList, UploadDocumentForm, type Doc } from "@/components/admin/DocumentsPanel";
import { DOCUMENT_CATEGORIES, DOCUMENT_ENTITY_TYPES } from "@/lib/shared/domain";
import { useRpc } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const can = useCan();
  const [f, setF] = useState({
    category: "",
    entityType: "",
    search: "",
    includeHistory: false,
    includeArchived: false,
  });
  const [uploading, setUploading] = useState(false);
  const q = useRpc<{ documents: Doc[] }>("documents.list", f);
  return (
    <>
      <PageHeader
        title="Document Center"
        description="Private storage: files are only reachable through 60-second signed links issued after a permission check, and every download is audited. Restricted documents need extra permission. Malware scanning is not yet connected (see docs)."
        actions={
          can("documents.write") && (
            <Button
              className="bg-navy text-white hover:bg-navy/90"
              onClick={() => setUploading((u) => !u)}
            >
              {uploading ? "Close" : "Upload company document"}
            </Button>
          )
        }
      />
      {uploading && (
        <Panel title="Upload" className="mb-4">
          <UploadDocumentForm entityType="company" onDone={() => setUploading(false)} />
        </Panel>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search documents"
          placeholder="Search title or filename…"
          className={cn(inputCls, "max-w-xs")}
          value={f.search}
          onChange={(e) => setF({ ...f, search: e.target.value })}
        />
        <select
          aria-label="Category"
          className={cn(inputCls, "w-auto")}
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
        >
          <option value="">All categories</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Linked to"
          className={cn(inputCls, "w-auto")}
          value={f.entityType}
          onChange={(e) => setF({ ...f, entityType: e.target.value })}
        >
          <option value="">Any record</option>
          {DOCUMENT_ENTITY_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.includeHistory}
            onChange={(e) => setF({ ...f, includeHistory: e.target.checked })}
          />
          Older versions
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.includeArchived}
            onChange={(e) => setF({ ...f, includeArchived: e.target.checked })}
          />
          Archived
        </label>
      </div>
      <Panel>
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          <DocumentList docs={q.data!.documents} showEntity />
        )}
      </Panel>
    </>
  );
}
