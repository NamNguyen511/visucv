// Server component: formulas are typeset by KaTeX at build time, so no math JS ships to the browser.
import katex from "katex";
import type { Algorithm } from "@/lib/algos/types";

const card = "rounded-2xl border border-border bg-card p-5";
const heading = "mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground";

export function Explainer({ explain }: { explain: Algorithm["explain"] }) {
  const { ideas, formulas = [], tryThis } = explain;
  return (
    <div className={`mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 ${formulas.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : "lg:grid-cols-2"}`}>
      <div className="space-y-5">
        <section className={card} aria-labelledby="key-ideas">
          <h2 id="key-ideas" className={heading}>Key ideas</h2>
          <ul className="space-y-3 leading-relaxed">
            {ideas.map(i => (
              <li key={i.term} className="flex gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span><strong className="font-semibold">{i.term}.</strong> <span className="text-muted-foreground">{i.text}</span></span>
              </li>
            ))}
          </ul>
        </section>
        {formulas.length > 0 && <TryThis items={tryThis} />}
      </div>

      {formulas.length > 0 ? (
        <section className={card} aria-labelledby="the-math">
          <h2 id="the-math" className={heading}>The math</h2>
          <dl className="divide-y divide-border">
            {formulas.map(f => (
              <div key={f.label} className="py-3 first:pt-0 last:pb-0">
                <dt className="text-sm font-semibold">{f.label}</dt>
                <dd
                  className="overflow-x-auto overflow-y-hidden py-1 text-[0.8rem] sm:text-[0.95rem]"
                  dangerouslySetInnerHTML={{ __html: katex.renderToString(f.tex, { displayMode: true, throwOnError: true }) }}
                />
                {f.note && <dd className="text-sm text-muted-foreground">{f.note}</dd>}
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <TryThis items={tryThis} />
      )}
    </div>
  );
}

function TryThis({ items }: { items: string[] }) {
  return (
    <section className={card} aria-labelledby="try-this">
      <h2 id="try-this" className={heading}>Try this</h2>
      <ol className="space-y-3 leading-relaxed">
        {items.map((t, n) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-highlight font-mono text-xs font-semibold text-accent">
              {n + 1}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
