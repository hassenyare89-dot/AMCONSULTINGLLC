import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { fieldCls } from "./forms";
import { cn } from "@/lib/utils";

type NominatimResult = { place_id: number; display_name: string; lat: string; lon: string };

/**
 * Address search via OpenStreetMap Nominatim (no API key). Text typed here is sent from the
 * browser to Nominatim — disclosed in the Privacy Policy. Accessible combobox pattern.
 */
export function AddressAutocomplete({
  id,
  name,
  disabled,
  placeholder = "Start typing an address…",
  describedBy,
  invalid,
  required,
}: {
  id: string;
  name: string;
  disabled?: boolean;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
}) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const skip = useRef(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal, headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as NominatimResult[];
        setResults(data);
        setOpen(data.length > 0);
        setActive(-1);
      } catch {
        /* address search is optional */
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) =>
      !wrapper.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (r: NominatimResult) => {
    skip.current = true;
    setValue(r.display_name);
    setResults([]);
    setOpen(false);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator))
      return toast.error("Location isn't supported by this browser");
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { Accept: "application/json" } },
          );
          const data = (await res.json()) as { display_name?: string };
          if (data.display_name) {
            skip.current = true;
            setValue(data.display_name);
          } else toast.error("Couldn't find an address for your location");
        } catch {
          toast.error("Location lookup failed");
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        toast.error("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div ref={wrapper} className="relative">
      <MapPin
        className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"
        aria-hidden
      />
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="street-address"
        required={required}
        value={value}
        disabled={disabled}
        maxLength={300}
        placeholder={placeholder}
        className={cn(fieldCls, "pl-9 pr-28")}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            select(results[active]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={disabled || geoLoading}
        className="absolute right-2 top-1.5 inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-brand-green-ink hover:underline disabled:opacity-50 focus-visible:focus-brand"
      >
        {geoLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <MapPin className="h-3 w-3" aria-hidden />
        )}{" "}
        Use my location
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-white shadow-xl"
        >
          {loading && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
          {results.map((r, i) => (
            <li
              key={r.place_id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-secondary",
                i === active && "bg-secondary",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                select(r);
              }}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green-ink" aria-hidden />
              <span className="line-clamp-2">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
