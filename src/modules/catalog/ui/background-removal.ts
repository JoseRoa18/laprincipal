/**
 * Background removal (@imgly/background-removal, model downloaded from its CDN on first use).
 *
 * It runs in a dedicated worker, one photo at a time, and the worker is closed
 * when there is nothing left to do or when the page goes to the background:
 * the model takes hundreds of MB that a page can never give back, and phones
 * close a tab that holds that much while the camera or WhatsApp is open, so
 * the page came back reloaded and empty. Browsers without OffscreenCanvas in
 * workers (or where the worker fails to start) run it on the page, as before.
 */
import type { RemovalMessage, RemovalRequest } from "./background-removal.worker";
import { isMobileDevice } from "./photo-pipeline";

export interface RemovalProgress {
  stage: "download" | "compute";
  percent: number;
}

/** The cut-out itself, once the model is loaded. The first download has no limit: it can be skipped. */
const COMPUTE_TIMEOUT_MS = 90_000;
/** On the page there is no way to tell the phases apart. */
const PAGE_TIMEOUT_MS = 5 * 60_000;
/** Idle time before the worker is closed. */
const IDLE_CLOSE_MS = 15_000;

interface Job {
  id: string;
  blob: Blob;
  onProgress: (p: RemovalProgress) => void;
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
  /** The model is loaded and the cut-out started. */
  computing: boolean;
  /** Cancelled while the model was still downloading: the download goes on, the result is dropped. */
  detached: boolean;
}

const queue: Job[] = [];
let current: Job | null = null;
let worker: Worker | null = null;
/** The current worker has answered at least once (it loaded fine). */
let workerAlive = false;
/** The worker could not start in this browser: everything runs on the page. */
let workerBroken = false;
let computeTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const modelFor = (): RemovalRequest["model"] => (isMobileDevice() ? "isnet_quint8" : "isnet_fp16");
const canUseWorker = () => !workerBroken && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
const pageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const percentOf = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

function closeWorker() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
  workerAlive = false;
}

/** Finish the running job and start the next one. */
function settle(fn: (job: Job) => void) {
  clearTimeout(computeTimer);
  const job = current;
  current = null;
  if (job && !job.detached) fn(job);
  pump();
}

/** Stop the running cut-out and free its memory; it starts over when the page is back. */
function suspendCurrent() {
  clearTimeout(computeTimer);
  if (current && !current.detached) queue.unshift(current);
  current = null;
  closeWorker();
}

function onMessage(msg: RemovalMessage) {
  workerAlive = true;
  if (!current || msg.id !== current.id) return;
  if (msg.type === "done") return settle((job) => job.resolve(msg.blob));
  if (msg.type === "error") return settle((job) => job.reject(new Error(msg.message)));
  const download = msg.key.startsWith("fetch");
  if (!download && !current.computing) {
    // The model is loaded (and in the browser cache). A cut-out nobody wants is skipped,
    // and one that would run with the page in the background waits for it to come back.
    if (current.detached || pageHidden()) {
      suspendCurrent();
      return pump();
    }
    current.computing = true;
    computeTimer = setTimeout(() => {
      closeWorker();
      settle((job) => job.reject(new Error("timeout")));
    }, COMPUTE_TIMEOUT_MS);
  }
  current.onProgress({ stage: download ? "download" : "compute", percent: percentOf(msg.done, msg.total) });
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./background-removal.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (event: MessageEvent<RemovalMessage>) => onMessage(event.data);
  w.onerror = (event) => {
    event.preventDefault();
    const neverStarted = !workerAlive;
    closeWorker();
    if (!neverStarted) return settle((job) => job.reject(new Error(event.message || "El recorte se detuvo")));
    // The worker cannot load here: the waiting photos go to the page instead.
    workerBroken = true;
    clearTimeout(computeTimer);
    const pending = [current, ...queue.splice(0)].filter((job): job is Job => job !== null && !job.detached);
    current = null;
    for (const job of pending) runOnPage(job);
  };
  worker = w;
  return w;
}

function pump() {
  clearTimeout(idleTimer);
  if (current) return;
  // In the background nothing runs and nothing is held: the page may be closed for memory.
  if (pageHidden()) return closeWorker();
  if (queue.length === 0) {
    idleTimer = setTimeout(closeWorker, IDLE_CLOSE_MS);
    return;
  }
  const job = queue.shift()!;
  current = job;
  job.computing = false;
  ensureWorker().postMessage({ id: job.id, blob: job.blob, model: modelFor() } satisfies RemovalRequest);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") return pump();
    // To the background (camera, WhatsApp...): free the memory now. A first-time
    // model download is left to finish; it stops before the cut-out.
    if (!current) closeWorker();
    else if (current.computing) suspendCurrent();
  });
}

/** Page fallback: the library keeps the options of its first call, so progress goes through this. */
let pageProgress: ((p: RemovalProgress) => void) | null = null;
let pageChain: Promise<unknown> = Promise.resolve();

async function removeInPage(job: Job): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  pageProgress = job.onProgress;
  const work = removeBackground(job.blob, {
    model: modelFor(),
    output: { format: "image/png", quality: 1 },
    progress: (key, done, total) => pageProgress?.({ stage: key.startsWith("fetch") ? "download" : "compute", percent: percentOf(done, total) }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), PAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    pageProgress = null;
  }
}

function runOnPage(job: Job) {
  const run = pageChain.then(() => removeInPage(job));
  pageChain = run.catch(() => undefined);
  run.then(job.resolve, job.reject);
}

/**
 * Transparent PNG cut-out of the photo. Photos wait their turn (one at a time).
 * Rejects with Error("timeout") when the cut-out takes too long and
 * Error("cancelled") after cancelBackgroundRemoval; the caller keeps the original.
 */
export function removeBackgroundQueued(id: string, blob: Blob, onProgress: (p: RemovalProgress) => void): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const job: Job = { id, blob, onProgress, resolve, reject, computing: false, detached: false };
    if (!canUseWorker()) return runOnPage(job);
    queue.push(job);
    pump();
  });
}

/** The photo was discarded or kept as it is: drop its cut-out. */
export function cancelBackgroundRemoval(id: string) {
  const waiting = queue.findIndex((job) => job.id === id);
  if (waiting >= 0) {
    queue.splice(waiting, 1)[0].reject(new Error("cancelled"));
    return pump();
  }
  if (current?.id !== id || current.detached) return;
  if (current.computing) {
    // Closing the worker stops the cut-out and frees its memory.
    closeWorker();
    return settle((job) => job.reject(new Error("cancelled")));
  }
  // Still downloading the model: let it finish for the next photos.
  current.detached = true;
  current.reject(new Error("cancelled"));
}

/** Whether the photo is waiting for another one to finish first. */
export function isQueued(id: string): boolean {
  return queue.some((job) => job.id === id);
}
