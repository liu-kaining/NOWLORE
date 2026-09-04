import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const documents = [resolve(root, "README.md"), resolve(root, "CHANGELOG.md"), ...await markdownFiles(resolve(root, "docs"))];
const missing = [];

for (const document of documents) {
  const contents = await readFile(document, "utf8");
  for (const match of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const path = decodeURIComponent(href.split("#", 1)[0]);
    if (!path) continue;
    const target = resolve(dirname(document), path);
    try {
      await access(target);
    } catch {
      missing.push(`${document.slice(root.length + 1)} -> ${href}`);
    }
  }
}

if (missing.length > 0) {
  process.stderr.write(`Broken documentation links:\n${missing.map((item) => `- ${item}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Documentation links valid (${documents.length} files).\n`);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : extname(entry.name) === ".md" ? [path] : [];
  }));
  return files.flat();
}
