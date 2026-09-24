import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      specifier = pathToFileURL(
        resolve("apps/web/src", specifier.slice(2)),
      ).href;
    if (
      (specifier.startsWith(".") || specifier.startsWith("file:")) &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(fileURLToPath(url) + ".ts")) specifier = url.href + ".ts";
    }
    const result = nextResolve(specifier, context);
    if (result.url.endsWith(".json"))
      return { ...result, importAttributes: { type: "json" } };
    return result;
  },
});
