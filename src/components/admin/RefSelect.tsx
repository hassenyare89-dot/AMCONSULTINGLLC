import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRpc } from "@/lib/admin/rpc";
import { cn } from "@/lib/utils";

/** Searchable picker for a referenced record (driver, truck, customer, staff…). */
export function RefSelect({
  id,
  target,
  value,
  onChange,
  initialLabel,
  disabled,
  placeholder = "Select…",
  allowClear = true,
  ariaLabel,
}: {
  id?: string;
  target: string;
  value: string | null | undefined;
  onChange: (v: string | null, label?: string) => void;
  initialLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [label, setLabel] = useState(initialLabel);
  useEffect(() => setLabel(initialLabel), [initialLabel]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const q = useRpc<{ options: { value: string; label: string }[] }>(
    "resource.options",
    { target, search: debounced },
    { enabled: open },
  );
  const shown = value
    ? (label ?? q.data?.options.find((o) => o.value === value)?.label ?? "Selected")
    : null;

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className={cn("truncate", !shown && "text-muted-foreground")}>
              {shown ?? placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                {q.isLoading ? "Loading…" : q.error ? q.error.message : "No matches."}
              </CommandEmpty>
              <CommandGroup>
                {(q.data?.options ?? []).map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      onChange(o.value, o.label);
                      setLabel(o.label);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === o.value ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {allowClear && value && !disabled && (
        <button
          type="button"
          className="rounded-md px-2 text-muted-foreground hover:text-foreground focus-visible:focus-brand"
          aria-label="Clear selection"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
