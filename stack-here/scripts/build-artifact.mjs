// Builds the single-file page: artifact/template.html + bundled lib + artifact/app.js -> artifact/dist/stack-here.html
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = await build({
  entryPoints: [path.join(root, "artifact/entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "SH",
  minify: true,
  write: false,
  target: "es2020",
});
const safe = (s) => s.replace(/<\/(script)/gi, "<\\/$1");
const bundle = safe(out.outputFiles[0].text);
const app = safe(await readFile(path.join(root, "artifact/app.js"), "utf8"));
const template = await readFile(path.join(root, "artifact/template.html"), "utf8");
const html = template.replace("/*__BUNDLE__*/", () => bundle).replace("/*__APP__*/", () => app);
await mkdir(path.join(root, "artifact/dist"), { recursive: true });
await writeFile(path.join(root, "artifact/dist/stack-here.html"), html);
console.log(`artifact/dist/stack-here.html ${(html.length / 1024).toFixed(0)} KB`);
