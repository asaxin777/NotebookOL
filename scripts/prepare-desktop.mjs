import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const nodeModulesPath = path.join(standaloneRoot, "node_modules");
const tracedModulesPath = path.join(standaloneRoot, ".next", "node_modules");
const vendorPath = path.join(standaloneRoot, "vendor");
const runtimeDirectory = path.join(projectRoot, ".desktop-build");

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The portable desktop build requires 64-bit Windows.");
}

for (const requiredPath of [
  path.join(standaloneRoot, "server.js"),
  path.join(nodeModulesPath, "next", "package.json"),
  path.join(nodeModulesPath, "better-sqlite3", "package.json"),
  path.join(projectRoot, ".next", "static"),
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Required production build output is missing: ${requiredPath}`);
  }
}

if (existsSync(tracedModulesPath)) {
  for (const entry of readdirSync(tracedModulesPath)) {
    const entryPath = path.join(tracedModulesPath, entry);
    if (lstatSync(entryPath).isSymbolicLink()) {
      const targetPath = realpathSync(entryPath);
      rmSync(entryPath, { recursive: true, force: true });
      cpSync(targetPath, entryPath, { recursive: true, dereference: true });
    }
  }
}

if (existsSync(nodeModulesPath)) {
  renameSync(nodeModulesPath, vendorPath);
} else if (!existsSync(vendorPath)) {
  throw new Error("Next.js standalone dependencies could not be found.");
}

const requireFromStandalone = createRequire(path.join(standaloneRoot, "server.js"));
const Database = requireFromStandalone(path.join(vendorPath, "better-sqlite3"));
new Database(":memory:").close();

mkdirSync(runtimeDirectory, { recursive: true });
copyFileSync(process.execPath, path.join(runtimeDirectory, "node.exe"));
console.log("Prepared the standalone server and matching Node.js runtime for Windows packaging.");
