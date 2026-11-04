import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { GEORGIA_COUNTIES } from "@/lib/shared/domain";
import { cn } from "@/lib/utils";
import { fieldCls } from "./forms";

/**
 * Searchable multi-select of Georgia's 159 counties (combobox + listbox pattern).
 * Selected counties are submitted as repeated `name` fields.
 */
export function CountyMultiSelect({
  name,
  error,
  required,
}: {
  name: string;
  error?: string;
  required?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const inputId = `fld-${name}`;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? GEORGIA_COUNTIES.filter((c) => c.toLowerCase().includes(q)) : [...GEORGIA_COUNTIES];
  }, [query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onDown = (e: MouseEvent) =>
      !wrapper.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Reset when the surrounding form is reset after a successful submit.
  useEffect(() => {
    const form = wrapper.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setSelected([]);
      setQuery("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const toggle = (c: string) =>
    setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  return (
    <div ref={wrapper} className="space-y-2">
      {selected.map((c) => (
        <input key={c} type="hidden" name={name} value={c} />
      ))}
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected counties">
          {selected.map((c) => (
            <li
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-navy/10 py-1 pl-3 pr-1 text-sm font-medium text-navy"
            >
              {c}
              <button
                type="button"
                onClick={() => toggle(c)}
                aria-label={`Remove ${c} County`}
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-navy/15 focus-visible:focus-brand"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"
          aria-hidden
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[`${inputId}-help`, error && `${inputId}-err`]
            .filter(Boolean)
            .join(" ")}
          aria-required={required || undefined}
          autoComplete="off"
          placeholder={selected.length ? "Add another county…" : "Search Georgia counties…"}
          value={query}
          className={cn(fieldCls, "pl-9 pr-9")}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(matches.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              if (open && matches[active]) {
                e.preventDefault();
                toggle(matches[active]);
                setQuery("");
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !query && selected.length) {
              setSelected((s) => s.slice(0, -1));
            }
          }}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500"
          aria-hidden
        />
        {open && (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Georgia counties"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-white py-1 shadow-xl"
          >
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No county matches.</li>
            )}
            {matches.map((c, i) => {
              const isSel = selected.includes(c);
              return (
                <li
                  key={c}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  className={cn(
                    "flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-charcoal",
                    i === active && "bg-secondary",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(c);
                  }}
                >
                  {c} County
                  {isSel && <Check className="h-4 w-4 text-brand-green-ink" aria-hidden />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        Type to search, then select every county you serve.
        {selected.length > 0 && ` ${selected.length} selected.`}
      </p>
      {error && (
        <p id={`${inputId}-err`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
