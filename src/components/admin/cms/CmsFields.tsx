import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CmsField } from "@/lib/shared/cms-schema";
import { sanitizeHtml } from "@/lib/shared/sanitize";
import { uploadFile, useRpc } from "@/lib/admin/rpc";
import { inputCls } from "../kit";
import { cn } from "@/lib/utils";

type V = any;

export function CmsFieldEditor({
  field,
  value,
  onChange,
  path,
}: {
  field: CmsField;
  value: V;
  onChange: (v: V) => void;
  path: string;
}) {
  const id = `cms-${path}`;
  const label = (
    <Label htmlFor={id} className="mb-1 block">
      {field.label}
    </Label>
  );
  const help = field.help && <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>;
  switch (field.type) {
    case "text":
    case "url":
      return (
        <div>
          {label}
          <input
            id={id}
            className={inputCls}
            value={value ?? ""}
            maxLength={field.type === "text" ? field.max : 2000}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
    case "textarea":
      return (
        <div>
          {label}
          <textarea
            id={id}
            className={cn(inputCls, "min-h-20")}
            value={value ?? ""}
            maxLength={field.max}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
    case "richtext":
      return (
        <div>
          <span className="mb-1 block text-sm font-medium">{field.label}</span>
          <RichTextEditor id={id} value={value ?? ""} onChange={onChange} />
          {help}
        </div>
      );
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <Label htmlFor={id}>{field.label}</Label>
          <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      );
    case "select":
      return (
        <div>
          {label}
          <select
            id={id}
            className={inputCls}
            value={value ?? field.options[0]?.value}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    case "media":
      return (
        <div>
          {label}
          <MediaField id={id} kind={field.kind} value={value ?? ""} onChange={onChange} />
          {help}
        </div>
      );
    case "stringList": {
      const list: string[] = Array.isArray(value) ? value : [];
      return (
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          <ul className="space-y-2">
            {list.map((item, i) => (
              <li key={i} className="flex gap-1">
                <label
                  className="sr-only"
                  htmlFor={`${id}-${i}`}
                >{`${field.label} ${i + 1}`}</label>
                <input
                  id={`${id}-${i}`}
                  className={inputCls}
                  value={item}
                  maxLength={field.max}
                  onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <ItemControls
                  i={i}
                  n={list.length}
                  onMove={(d) => onChange(move(list, i, d))}
                  onRemove={() => onChange(list.filter((_, j) => j !== i))}
                />
              </li>
            ))}
          </ul>
          {list.length < (field.maxItems ?? 20) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => onChange([...list, ""])}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Add
            </Button>
          )}
          {help}
        </fieldset>
      );
    }
    case "objectList": {
      const list: Record<string, V>[] = Array.isArray(value) ? value : [];
      const blank = () =>
        Object.fromEntries(
          field.fields.map((f) => [
            f.name,
            f.type === "boolean" ? false : f.type === "stringList" ? [] : "",
          ]),
        );
      return (
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          <ol className="space-y-3">
            {list.map((item, i) => (
              <li key={i} className="rounded-md border border-dashed border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Item {i + 1}
                  </span>
                  <ItemControls
                    i={i}
                    n={list.length}
                    onMove={(d) => onChange(move(list, i, d))}
                    onRemove={() => onChange(list.filter((_, j) => j !== i))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field.fields.map((sub) => (
                    <div
                      key={sub.name}
                      className={cn(
                        ["textarea", "stringList", "objectList", "richtext"].includes(sub.type) &&
                          "sm:col-span-2",
                      )}
                    >
                      <CmsFieldEditor
                        field={sub}
                        path={`${path}-${i}-${sub.name}`}
                        value={item[sub.name]}
                        onChange={(v) =>
                          onChange(list.map((x, j) => (j === i ? { ...x, [sub.name]: v } : x)))
                        }
                      />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {list.length < (field.maxItems ?? 30) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => onChange([...list, blank()])}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Add item
            </Button>
          )}
          {help}
        </fieldset>
      );
    }
  }
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function ItemControls({
  i,
  n,
  onMove,
  onRemove,
}: {
  i: number;
  n: number;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const btn =
    "rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 focus-visible:focus-brand";
  return (
    <span className="flex shrink-0">
      <button
        type="button"
        className={btn}
        disabled={i === 0}
        onClick={() => onMove(-1)}
        aria-label="Move up"
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        disabled={i === n - 1}
        onClick={() => onMove(1)}
        aria-label="Move down"
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:text-destructive")}
        onClick={onRemove}
        aria-label="Remove"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Minimal rich text editor (contentEditable). Output is sanitized locally for preview and
 * authoritatively on the server; only the allow-listed tags in sanitize.ts survive.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"visual" | "html">("visual");
  useEffect(() => {
    if (ref.current && mode === "visual" && document.activeElement !== ref.current)
      ref.current.innerHTML = sanitizeHtml(value);
  }, [value, mode]);
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(sanitizeHtml(ref.current?.innerHTML ?? ""));
  };
  const tb = "rounded p-1.5 hover:bg-secondary focus-visible:focus-brand";
  return (
    <div className="rounded-md border border-input">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/40 p-1"
      >
        <button type="button" className={tb} onClick={() => exec("bold")} aria-label="Bold">
          <Bold className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={tb} onClick={() => exec("italic")} aria-label="Italic">
          <Italic className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={tb}
          onClick={() => exec("formatBlock", "<h2>")}
          aria-label="Heading 2"
        >
          <Heading2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={tb}
          onClick={() => exec("formatBlock", "<h3>")}
          aria-label="Heading 3"
        >
          <Heading3 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={tb}
          onClick={() => exec("formatBlock", "<p>")}
          aria-label="Paragraph"
        >
          ¶
        </button>
        <button
          type="button"
          className={tb}
          onClick={() => exec("insertUnorderedList")}
          aria-label="Bulleted list"
        >
          <List className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={tb}
          onClick={() => exec("insertOrderedList")}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={tb}
          aria-label="Link"
          onClick={() => {
            const url = window.prompt("Link URL (https://…, /page, mailto: or tel:)");
            if (url) exec("createLink", url);
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(tb, "ml-auto text-xs")}
          aria-pressed={mode === "html"}
          onClick={() => setMode((m) => (m === "html" ? "visual" : "html"))}
        >
          {mode === "html" ? "Visual" : "HTML"}
        </button>
      </div>
      {mode === "visual" ? (
        <div
          id={id}
          ref={ref}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className="prose-brand min-h-48 max-h-[32rem] overflow-y-auto p-3 text-sm focus:outline-none"
          onInput={() => onChange(sanitizeHtml(ref.current?.innerHTML ?? ""))}
        />
      ) : (
        <textarea
          id={id}
          className="min-h-48 w-full p-3 font-mono text-xs focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(sanitizeHtml(value))}
        />
      )}
    </div>
  );
}

export function MediaField({
  id,
  kind,
  value,
  onChange,
}: {
  id: string;
  kind: "image" | "video" | "model";
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          id={id}
          className={inputCls}
          value={value}
          placeholder="Default asset"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ImageIcon className="mr-1 h-4 w-4" aria-hidden /> Library
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Use default
          </Button>
        )}
      </div>
      {value && kind === "image" && (
        <img src={value} alt="" className="h-24 rounded border object-cover" />
      )}
      {value && kind === "video" && (
        <video src={value} className="h-24 rounded border" muted controls />
      )}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function MediaUploader({
  kind,
  onUploaded,
}: {
  kind?: "image" | "video" | "model";
  onUploaded?: (m: { public_url: string }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const accept =
    kind === "video"
      ? "video/mp4,video/webm"
      : kind === "model"
        ? ".glb,model/gltf-binary"
        : kind === "image"
          ? "image/jpeg,image/png,image/webp,image/avif"
          : "image/*,video/mp4,video/webm,.glb";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = ref.current?.files?.[0];
        if (!f) return;
        setBusy(true);
        try {
          const r = await uploadFile("media", f, { alt });
          toast.success("Uploaded");
          if (ref.current) ref.current.value = "";
          setAlt("");
          onUploaded?.(r.media);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="media-file">File</Label>
        <input
          id="media-file"
          ref={ref}
          type="file"
          accept={accept}
          className={cn(inputCls, "mt-1")}
          required
        />
      </div>
      <div className="min-w-48 flex-1">
        <Label htmlFor="media-alt">Alt text (describe the image)</Label>
        <input
          id="media-alt"
          className={cn(inputCls, "mt-1")}
          value={alt}
          maxLength={300}
          onChange={(e) => setAlt(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy} size="sm">
        <Upload className="mr-1 h-4 w-4" aria-hidden /> Upload
      </Button>
    </form>
  );
}

function MediaPicker({
  open,
  onOpenChange,
  kind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "image" | "video" | "model";
  onPick: (url: string) => void;
}) {
  const q = useRpc<{ media: any[] }>("media.list", { kind }, { enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose {kind}</DialogTitle>
          <DialogDescription>
            Upload a new file or pick one from the media library.
          </DialogDescription>
        </DialogHeader>
        <MediaUploader
          kind={kind}
          onUploaded={(m) => {
            q.refetch();
            onPick(m.public_url);
          }}
        />
        <ul className="mt-4 grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
          {(q.data?.media ?? []).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full overflow-hidden rounded-lg border border-border text-left hover:border-brand-green focus-visible:focus-brand"
                onClick={() => onPick(m.public_url)}
              >
                {m.kind === "image" ? (
                  <img
                    src={m.public_url}
                    alt={m.alt_text ?? ""}
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-24 place-items-center bg-secondary text-xs">
                    {m.kind.toUpperCase()}
                  </div>
                )}
                <span className="block truncate p-1 text-xs">{m.filename}</span>
              </button>
            </li>
          ))}
          {q.data && !q.data.media.length && (
            <li className="col-span-full text-sm text-muted-foreground">
              No {kind} files uploaded yet.
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
