// Runs the Photograph lab's pipeline off the main thread, so a slow chain (bilateral 5×5 at 384 px) doesn't
// freeze the page. Keeps the last run, so a knob only recomputes its stage and what follows it.
import type { Grid } from "./algos/types";
import { type Run, type Stage, runPipeline } from "./photo";

let I: Grid, last: Run | undefined;
self.onmessage = (e: MessageEvent<{ I?: Grid; stages: Stage[] }>) => {
  if (e.data.I) I = e.data.I; // sent only when the photo changes
  last = runPipeline(I, e.data.stages, last);
  self.postMessage(last.outs);
};
