import { createHash } from "node:crypto";

import { fingerprint } from "./resource-fingerprint";

export function revisionOf(value: unknown): string {
  return createHash("sha256").update(fingerprint(value)).digest("hex");
}
