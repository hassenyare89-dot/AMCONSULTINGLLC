import { useEffect, useMemo, useState } from "react";
import { stringParams } from "@/lib/shared/search";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  inputCls,
} from "@/components/admin/kit";
import { ResourceManager } from "@/components/admin/ResourceManager";
import { CmsFieldEditor, MediaUploader } from "@/components/admin/cms/CmsFields";
import { HeroView } from "@/components/site/Hero";
import { LegalPage } from "@/components/site/LegalPage";
import { getCmsSection } from "@/lib/shared/cms-schema";
import { fmtDateTime, rpc, useRpc, useRpcMutation } from "@/lib/admin/rpc";
import { useCan } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/cms")({
  validateSearch: stringParams("section", "tab"),
  component: CmsPage,
});

function CmsPage() {
  const { section, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader
        title="Website CMS"
        description="Edit website content without code. Changes are saved as drafts, can be previewed, published immediately or scheduled, and every version is kept for restore."
      />
      <Tabs value={tab ?? "content"} onValueChange={(v) => navigate({ search: { tab: v } })}>
        <TabsList>
          <TabsTrigger value="content">Pages & sections</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="media">Media library</TabsTrigger>
        </TabsList>
        <TabsContent value="content" className="mt-4">
          {section ? (
            <SectionEditor
              key={section}
              sectionKey={section}
              onBack={() => navigate({ search: {} })}
            />
          ) : (
            <SectionList onOpen={(k) => navigate({ search: { section: k } })} />
          )}
        </TabsContent>
        <TabsContent value="faqs" className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Published FAQs appear on /faq with search and FAQ structured data. Answers are plain
            text.
          </p>
          <ResourceManager
            resource="faq_entries"
            emptyHint="Add questions customers and drivers commonly ask."
          />
        </TabsContent>
        <TabsContent value="media" className="mt-4">
          <MediaLibrary />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SectionList({ onOpen }: { onOpen: (k: string) => void }) {
  const q = useRpc<{ sections: any[] }>("cms.sections");
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const pages = [...new Set(q.data!.sections.map((s) => s.page))];
  return (
    <div className="space-y-4">
      {pages.map((p) => (
        <Panel key={p} title={p}>
          <ul className="divide-y divide-border">
            {q
              .data!.sections.filter((s) => s.page === p)
              .map((s) => (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <button
                      type="button"
                      className="font-medium text-navy hover:underline focus-visible:focus-brand rounded"
                      onClick={() => onOpen(s.key)}
                    >
                      {s.title}
                    </button>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge
                      value={s.status}
                      label={
                        s.status === "default"
                          ? "using defaults"
                          : s.status === "changes_pending"
                            ? "unpublished changes"
                            : s.status
                      }
                    />
                    {s.scheduled_at && <span>for {fmtDateTime(s.scheduled_at)}</span>}
                    {s.published_at && <span>published {fmtDateTime(s.published_at)}</span>}
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function SectionEditor({ sectionKey, onBack }: { sectionKey: string; onBack: () => void }) {
  const can = useCan();
  const def = getCmsSection(sectionKey);
  const q = useRpc<{
    draft: any;
    defaults: any;
    published: any;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    revisions: any[];
  }>("cms.section", { key: sectionKey });
  const [data, setData] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [preview, setPreview] = useState(true);
  useEffect(() => {
    if (q.data && !dirty) setData(structuredClone(q.data.draft ?? q.data.defaults));
  }, [q.data, dirty]);
  const inv = ["cms."];
  const save = useRpcMutation("cms.saveDraft", {
    invalidate: inv,
    success: "Draft saved",
    onSuccess: () => setDirty(false),
  });
  const publish = useRpcMutation("cms.publish", {
    invalidate: inv,
    success: (r: any) =>
      r.status === "scheduled" ? "Scheduled" : "Published — live on the website",
    onSuccess: () => setDirty(false),
  });
  const unpublish = useRpcMutation("cms.unpublish", {
    invalidate: inv,
    success: "Reverted to default content",
  });
  const restore = useRpcMutation("cms.restore", {
    invalidate: inv,
    success: "Revision restored into the draft",
    onSuccess: () => setDirty(false),
  });
  if (!def) return <ErrorState error={{ message: "Unknown section" }} />;
  if (q.isLoading || !data) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  const set = (k: string, v: any) => {
    setData((d: any) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← All sections
          </Button>
          <h2 className="mt-1 text-xl font-bold text-navy">{def.title}</h2>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            value={q.data!.status}
            label={
              q.data!.status === "default" ? "using defaults" : q.data!.status.replace("_", " ")
            }
          />
          {dirty && (
            <span className="text-xs font-semibold text-amber-700" role="status">
              Unsaved changes
            </span>
          )}
        </div>
      </div>
      <div className={cn("grid gap-4", preview && "xl:grid-cols-2")}>
        <Panel title="Content">
          <div className="space-y-4">
            {def.fields.map((f) => (
              <CmsFieldEditor
                key={f.name}
                field={f}
                path={f.name}
                value={data[f.name]}
                onChange={(v) => set(f.name, v)}
              />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate({ key: sectionKey, data })}
            >
              Save draft
            </Button>
            {can("cms.publish") && (
              <>
                <ConfirmButton
                  variant="default"
                  title="Publish to the live website?"
                  description="Visitors will see these changes within about 30 seconds."
                  confirmLabel="Publish"
                  onConfirm={() => publish.mutateAsync({ key: sectionKey, data })}
                >
                  Publish now
                </ConfirmButton>
                <div className="flex items-end gap-1">
                  <div>
                    <Label htmlFor="sched" className="text-xs">
                      Schedule for
                    </Label>
                    <input
                      id="sched"
                      type="datetime-local"
                      className={cn(inputCls, "h-9")}
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!scheduleAt}
                    onClick={() =>
                      publish.mutate({
                        key: sectionKey,
                        data,
                        scheduleAt: new Date(scheduleAt).toISOString(),
                      })
                    }
                  >
                    Schedule
                  </Button>
                </div>
                {q.data!.published && (
                  <ConfirmButton
                    title="Revert this section to default content?"
                    description="The published version is removed from the website; your draft and revisions are kept."
                    onConfirm={() => unpublish.mutateAsync({ key: sectionKey })}
                  >
                    Revert to defaults
                  </ConfirmButton>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-pressed={preview}
              onClick={() => setPreview((p) => !p)}
            >
              <Eye className="mr-1 h-4 w-4" aria-hidden />
              {preview ? "Hide preview" : "Show preview"}
            </Button>
          </div>
          {(save.error || publish.error) && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {(save.error ?? publish.error)!.message}
            </p>
          )}
        </Panel>
        {preview && (
          <Panel title="Live preview (draft)">
            <div className="max-h-[48rem] overflow-auto rounded-lg border border-border">
              <SectionPreview sectionKey={sectionKey} data={data} />
            </div>
          </Panel>
        )}
      </div>
      <Panel title="Revision history">
        <Revisions
          sectionKey={sectionKey}
          revisions={q.data!.revisions}
          onRestore={(id) => restore.mutate({ key: sectionKey, revisionId: id })}
        />
      </Panel>
    </div>
  );
}

function Revisions({
  sectionKey,
  revisions,
  onRestore,
}: {
  sectionKey: string;
  revisions: any[];
  onRestore: (id: string) => void;
}) {
  const [viewing, setViewing] = useState<any | null>(null);
  if (!revisions.length) return <p className="text-sm text-muted-foreground">No revisions yet.</p>;
  return (
    <>
      <ul className="divide-y divide-border text-sm">
        {revisions.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <StatusBadge
                value={
                  r.action === "publish"
                    ? "published"
                    : r.action === "schedule"
                      ? "scheduled"
                      : "draft"
                }
                label={r.action}
              />{" "}
              {fmtDateTime(r.created_at)}
            </span>
            <span className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () =>
                  setViewing(
                    (await rpc("cms.revision", { key: sectionKey, revisionId: r.id })).revision,
                  )
                }
              >
                View
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRestore(r.id)}>
                Restore to draft
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {viewing && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs">
            <span>Revision from {fmtDateTime(viewing.created_at)}</span>
            <button type="button" className="underline" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded bg-secondary p-3 text-xs">
            {JSON.stringify(viewing.data, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}

function SectionPreview({ sectionKey, data }: { sectionKey: string; data: any }) {
  if (sectionKey === "home.hero")
    return (
      <div className="pointer-events-none origin-top scale-[0.6] [width:166%]">
        <HeroView c={data} preview />
      </div>
    );
  if (sectionKey.startsWith("legal."))
    return (
      <div className="origin-top">
        <LegalPage title={data.title} lastUpdated={data.lastUpdated} body={data.body ?? ""} />
      </div>
    );
  if (sectionKey === "home.highlights") {
    const shown = (data.items ?? []).filter((i: any) => i.verified && i.value);
    return (
      <div className="p-4 text-sm">
        {shown.length ? (
          shown.map((i: any) => (
            <div key={i.label}>
              <strong>{i.value}</strong> {i.label}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">
            Nothing will be shown — no items are marked verified.
          </p>
        )}
      </div>
    );
  }
  // Generic structured preview
  return (
    <dl className="space-y-3 p-4 text-sm">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {k}
          </dt>
          <dd className="mt-1">
            {Array.isArray(v) ? (
              <ul className="list-disc pl-5">
                {v.map((x, i) => (
                  <li key={i}>
                    {typeof x === "object"
                      ? Object.values(x as object)
                          .filter((y) => typeof y === "string")
                          .join(" — ")
                      : String(x)}
                  </li>
                ))}
              </ul>
            ) : typeof v === "boolean" ? (
              v ? (
                "Yes"
              ) : (
                "No"
              )
            ) : (
              String(v ?? "")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MediaLibrary() {
  const can = useCan();
  const [kind, setKind] = useState("");
  const q = useRpc<{ media: any[] }>("media.list", { kind });
  const del = useRpcMutation("media.delete", { invalidate: ["media."], success: "Deleted" });
  const alt = useRpcMutation("media.alt", { invalidate: ["media."], success: "Alt text saved" });
  const sizes = useMemo(
    () => (b: number) =>
      b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`,
    [],
  );
  return (
    <div className="space-y-4">
      {can("media.write") && (
        <Panel title="Upload">
          <MediaUploader onUploaded={() => q.refetch()} />
          <p className="mt-2 text-xs text-muted-foreground">
            JPEG/PNG/WebP/AVIF up to 10 MB, MP4/WebM up to 100 MB, GLB up to 30 MB. File types are
            verified from content, not the extension. See docs/05-HERO_VIDEO_SPEC.md for the hero
            video.
          </p>
        </Panel>
      )}
      <select
        aria-label="Filter media type"
        className={cn(inputCls, "w-auto")}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="">All types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="model">3D models</option>
      </select>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data!.media.length ? (
        <EmptyState title="No media uploaded" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {q.data!.media.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-xl border border-border bg-card">
              {m.kind === "image" ? (
                <img
                  src={m.public_url}
                  alt={m.alt_text ?? ""}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                />
              ) : m.kind === "video" ? (
                <video
                  src={m.public_url}
                  className="h-36 w-full object-cover"
                  muted
                  preload="metadata"
                />
              ) : (
                <div className="grid h-36 place-items-center bg-secondary text-sm">
                  3D model (GLB)
                </div>
              )}
              <div className="space-y-2 p-3 text-xs">
                <p className="truncate font-medium">{m.filename}</p>
                <p className="text-muted-foreground">
                  {sizes(m.size_bytes)} · {fmtDateTime(m.created_at)}
                </p>
                {m.kind === "image" && can("media.write") && (
                  <input
                    aria-label={`Alt text for ${m.filename}`}
                    className={cn(inputCls, "h-8 text-xs")}
                    defaultValue={m.alt_text ?? ""}
                    placeholder="Alt text"
                    onBlur={(e) =>
                      e.target.value !== (m.alt_text ?? "") &&
                      alt.mutate({ id: m.id, alt: e.target.value })
                    }
                  />
                )}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(m.public_url)
                        .then(() => toast.success("URL copied"))
                    }
                  >
                    <Copy className="mr-1 h-3 w-3" aria-hidden />
                    Copy URL
                  </Button>
                  {can("media.write") && (
                    <ConfirmButton
                      variant="ghost"
                      title="Delete this file?"
                      description="Files still used by website content can't be deleted."
                      onConfirm={() => del.mutateAsync({ id: m.id })}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </ConfirmButton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
