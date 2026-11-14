import { FIELD_SEED, getField, type OrbitalField } from "./sim";

let pending: Promise<OrbitalField> | null = null;

/**
 * Resolves with the shared orbital field. Generation runs in a Web Worker so the page stays
 * responsive while it works; if workers are unavailable, or the worker is slow to answer, it runs
 * inline instead. Either way the result is identical, because the generator is deterministic.
 */
export function loadField(): Promise<OrbitalField> {
  if (pending) return pending;
  pending = new Promise<OrbitalField>((resolve) => {
    let settled = false;
    const finish = (field: OrbitalField) => {
      if (settled) return;
      settled = true;
      resolve(field);
    };
    const inline = () => finish(getField());

    if (typeof Worker === "undefined") {
      inline();
      return;
    }
    try {
      const worker = new Worker(new URL("./field.worker.ts", import.meta.url), { type: "module" });
      const timer = window.setTimeout(() => {
        worker.terminate();
        inline();
      }, 6000);
      worker.onmessage = (event: MessageEvent<OrbitalField>) => {
        window.clearTimeout(timer);
        worker.terminate();
        finish(event.data);
      };
      worker.onerror = () => {
        window.clearTimeout(timer);
        worker.terminate();
        inline();
      };
      worker.postMessage({ seed: FIELD_SEED });
    } catch {
      inline();
    }
  });
  return pending;
}
