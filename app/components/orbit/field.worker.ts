/// <reference lib="webworker" />
// Builds the orbital field off the main thread. The generator checks every pair of paths for
// collisions, which takes a few hundred milliseconds on a desktop and longer on a phone.

import { generateField, FIELD_SEED } from "./sim";

self.onmessage = (event: MessageEvent<{ seed?: string }>) => {
  const field = generateField(event.data?.seed ?? FIELD_SEED);
  self.postMessage(field);
};
