import { createFileRoute } from "@tanstack/react-router";
import { stringParams } from "@/lib/shared/search";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/shared/quote-math";
import { Field, FormError, fieldCls, postJson } from "@/components/site/forms";
import { useSiteContent } from "@/lib/content/site";

export const Route = createFileRoute("/quotes/view")({
  validateSearch: stringParams("token"),
  head: () => ({
    meta: [
      { title: "Your estimate | AM Consulting & Hauling" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: QuoteView,
});

type Est = {
  estimate_number: string;
  title: string;
  customer_name: string;
  customer_company: string | null;
  status: string;
  valid_until: string | null;
  terms: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  revision: number;
};

function QuoteView() {
  const { token } = Route.useSearch();
  const brand = useSiteContent()["site.brand"];
  const [data, setData] = useState<{
    estimate: Est;
    items: {
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      line_total: number;
    }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return setError("This estimate link is invalid.");
    fetch(`/api/public/quote-view?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j) : setError(j.error)))
      .catch(() => setError("Network error."));
  }, [token]);
  async function respond(action: "accept" | "decline", form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ message: string }>("/api/public/quote-view", {
        token,
        action,
        name: fd.get("name"),
        note: fd.get("note"),
      });
      setResult(r.message);
      setData((d) =>
        d
          ? {
              ...d,
              estimate: { ...d.estimate, status: action === "accept" ? "accepted" : "declined" },
            }
          : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const e = data?.estimate;
  return (
    <section className="bg-surface pb-20 pt-32 print:bg-white print:pt-4">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {e && data && (
          <article className="rounded-2xl border border-border bg-card p-6 sm:p-10 print:border-0 print:p-0">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-navy">{brand.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  {brand.addressLine1}, {brand.city}, {brand.state} {brand.zip} · {brand.phone} ·{" "}
                  {brand.email}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="print:hidden"
                onClick={() => window.print()}
              >
                <Printer className="mr-2 h-4 w-4" aria-hidden />
                Print / save PDF
              </Button>
            </header>
            <h1 className="mt-6 text-2xl font-extrabold text-navy">
              Estimate {e.estimate_number}
              {e.revision > 1 ? ` (rev. ${e.revision})` : ""}
            </h1>
            <p className="mt-1">{e.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for {e.customer_name}
              {e.customer_company ? `, ${e.customer_company}` : ""}
              {e.valid_until
                ? ` · valid until ${new Date(`${e.valid_until}T12:00:00`).toLocaleDateString()}`
                : ""}
            </p>
            <table className="mt-6 w-full text-sm">
              <caption className="sr-only">Estimate line items</caption>
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2">
                    Description
                  </th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Rate</th>
                  <th scope="col" className="text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i, k) => (
                  <tr key={k} className="border-b">
                    <td className="py-2">{i.description}</td>
                    <td>{i.quantity}</td>
                    <td>{i.unit.replace("_", " ")}</td>
                    <td>{formatMoney(i.unit_price)}</td>
                    <td className="text-right">{formatMoney(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(e.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{formatMoney(e.tax_amount)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-bold text-navy">
                <dt>Total</dt>
                <dd>{formatMoney(e.total)}</dd>
              </div>
            </dl>
            {e.terms && (
              <p className="mt-6 whitespace-pre-wrap text-xs text-muted-foreground">{e.terms}</p>
            )}
            <div className="mt-8 border-t pt-6 print:hidden">
              {result ? (
                <p role="status" className="font-medium">
                  {result}
                </p>
              ) : ["sent", "viewed"].includes(e.status) ? (
                <form className="space-y-4" onSubmit={(ev) => ev.preventDefault()}>
                  <h2 className="text-lg font-bold text-navy">Respond to this estimate</h2>
                  <Field
                    label="Your full name"
                    name="name"
                    required
                    help="Typing your name records your response. Acceptance signals intent to proceed; final terms are confirmed in a written agreement."
                  >
                    {(p) => <input {...p} autoComplete="name" className={fieldCls} />}
                  </Field>
                  <Field label="Note" name="note">
                    {(p) => <textarea {...p} rows={3} maxLength={1000} className={fieldCls} />}
                  </Field>
                  <FormError message={error} />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={busy}
                      className="bg-brand-green text-navy-deep hover:bg-brand-green/90"
                      onClick={(ev) => respond("accept", ev.currentTarget.form!)}
                    >
                      Accept estimate
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      variant="outline"
                      onClick={(ev) => respond("decline", ev.currentTarget.form!)}
                    >
                      Decline
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-sm">
                  Status: <strong>{e.status}</strong>. Contact us with any questions.
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
