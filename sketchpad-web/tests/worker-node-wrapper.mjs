import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parentPort } from "node:worker_threads";

const pendingMessages = [];
let messageHandler = null;
globalThis.self = {
  postMessage(message) {
    parentPort.postMessage(message);
  },
};
Object.defineProperty(globalThis.self, "onmessage", {
  get() {
    return messageHandler;
  },
  set(handler) {
    messageHandler = handler;
    for (const data of pendingMessages.splice(0)) handler({ data });
  },
});
parentPort.on("message", (data) => {
  if (messageHandler) messageHandler({ data });
  else pendingMessages.push(data);
});

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  const url = resource instanceof URL ? resource : new URL(resource);
  if (url.protocol !== "file:") return nativeFetch(resource, options);
  return new Response(await readFile(fileURLToPath(url)), {
    headers: { "Content-Type": "application/wasm" },
  });
};

await import("../web/machine-worker.js");
