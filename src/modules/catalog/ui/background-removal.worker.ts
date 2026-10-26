/**
 * Runs @imgly/background-removal off the page, one photo per message
 * (see background-removal.ts, which closes this worker to free the model's memory).
 */
import { removeBackground } from "@imgly/background-removal";

export interface RemovalRequest {
  id: string;
  blob: Blob;
  model: "isnet_quint8" | "isnet_fp16";
}

export type RemovalMessage =
  | { type: "progress"; id: string; key: string; done: number; total: number }
  | { type: "done"; id: string; blob: Blob }
  | { type: "error"; id: string; message: string };

const scope = self as unknown as {
  postMessage(message: RemovalMessage): void;
  onmessage: ((event: MessageEvent<RemovalRequest>) => void) | null;
};

let currentId = "";

scope.onmessage = async (event) => {
  const { id, blob, model } = event.data;
  currentId = id;
  try {
    const result = await removeBackground(blob, {
      model,
      output: { format: "image/png", quality: 1 },
      // The library keeps the options of its first call, so this reports for the photo running now.
      progress: (key, done, total) => scope.postMessage({ type: "progress", id: currentId, key, done, total }),
    });
    scope.postMessage({ type: "done", id, blob: result });
  } catch (err) {
    scope.postMessage({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
};
