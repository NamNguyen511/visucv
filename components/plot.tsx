import type { Plot as PlotData } from "@/lib/algos/types";

const W = 512, H = 150, PAD = 18; // viewBox units; the SVG scales to its container

/** Bars with a line over them on a shared x axis, plus cursor/best markers. */
export function Plot({ bars, line, lineMax, barLabel, lineLabel, cursor, best }: PlotData) {
  const n = bars.length, bw = W / n, barMax = Math.max(...bars, 1);
  const x = (i: number) => (i + 0.5) * bw;
  const yBar = (v: number) => H - (v / barMax) * (H - PAD);
  const yLine = (v: number) => H - (v / lineMax) * (H - PAD);
  // Line path that breaks at NaN (not computed / undefined).
  let d = "", pen = false;
  line.forEach((v, i) => {
    if (Number.isFinite(v)) { d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${yLine(v).toFixed(1)}`; pen = true; }
    else pen = false;
  });
  const marker = (m: { x: number; label: string }, cls: string, anchorRight: boolean) => (
    <g className={cls}>
      <line x1={x(m.x)} x2={x(m.x)} y1={PAD - 4} y2={H} strokeWidth={2} />
      <text x={x(m.x) + (anchorRight ? -5 : 5)} y={PAD - 6} textAnchor={anchorRight ? "end" : "start"}
            className="stroke-none text-[13px]" fill="currentColor">{m.label}</text>
    </g>
  );
  const bestLeftOfCursor = best && cursor && best.x < cursor.x;
  return (
    <figure className="mt-4">
      <figcaption className="mb-1 flex flex-wrap gap-x-4 font-mono text-xs text-muted-foreground">
        <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-muted-foreground/40 align-[-1px]" />{barLabel}</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 bg-accent align-middle" />{lineLabel}</span>
      </figcaption>
      <svg viewBox={`0 ${-4} ${W} ${H + 22}`} className="w-full overflow-visible" role="img" aria-label={`${barLabel} with ${lineLabel}`}>
        {bars.map((v, i) => v > 0 && (
          <rect key={i} x={i * bw} y={yBar(v)} width={Math.max(bw - 0.3, 0.5)} height={H - yBar(v)} className="fill-muted-foreground/40" />
        ))}
        <path d={d} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-accent" />
        <line x1={0} x2={W} y1={H} y2={H} strokeWidth={1} className="stroke-border" />
        {[0, 64, 128, 192, 255].map(t => (
          <text key={t} x={x(t)} y={H + 16} textAnchor="middle" className="fill-muted-foreground text-[12px]">{t}</text>
        ))}
        {best && marker(best, "stroke-accent text-accent", !!bestLeftOfCursor)}
        {cursor && marker(cursor, "stroke-cursor text-cursor", !bestLeftOfCursor && !!best)}
      </svg>
    </figure>
  );
}
