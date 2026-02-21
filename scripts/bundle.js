#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const entryFile = path.resolve(projectRoot, "src/main.js");
const outputFile = path.resolve(projectRoot, "app.js");
const modules = new Map();

function toModuleId(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function resolveLocalModule(fromFile, requestPath) {
  const fromDir = path.dirname(fromFile);
  const base = path.resolve(fromDir, requestPath);
  const candidates = [base, `${base}.js`, path.join(base, "index.js")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`Could not resolve "${requestPath}" from ${fromFile}`);
}

function collectModule(filePath) {
  const moduleId = toModuleId(filePath);
  if (modules.has(moduleId)) {
    return;
  }

  let code = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  code = code.replace(/^#![^\n]*\n/, "");
  const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;

  code = code.replace(requireRegex, (match, requestPath) => {
    if (!requestPath.startsWith(".")) {
      return match;
    }
    const resolved = resolveLocalModule(filePath, requestPath);
    const resolvedId = toModuleId(resolved);
    collectModule(resolved);
    return `__require("${resolvedId}")`;
  });

  modules.set(moduleId, code);
}

function buildBundle() {
  const entryId = toModuleId(entryFile);
  const orderedModules = [...modules.entries()];

  const moduleFactorySource = orderedModules
    .map(([id, code]) => {
      return `"${id}": function(module, exports, __require, __filename, __dirname, require) {\n${code}\n}`;
    })
    .join(",\n");

  return `#!/usr/bin/env node
(function() {
  const __nativeRequire = typeof require === "function" ? require : null;
  const __modules = {
${moduleFactorySource}
  };
  const __cache = {};

  function __require(id) {
    if (__cache[id]) {
      return __cache[id].exports;
    }
    if (!__modules[id]) {
      if (__nativeRequire) {
        return __nativeRequire(id);
      }
      throw new Error("Module not found: " + id);
    }

    const module = { exports: {} };
    __cache[id] = module;
    const __filename = id;
    const __dirname = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : ".";
    __modules[id](module, module.exports, __require, __filename, __dirname, __nativeRequire || __require);
    return module.exports;
  }

  __require("${entryId}");
})();
`;
}

function main() {
  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }

  collectModule(entryFile);
  const bundle = buildBundle();

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, bundle, "utf8");
  fs.chmodSync(outputFile, 0o755);

  console.log(`[bundle] Wrote ${outputFile}`);
  console.log(`[bundle] Modules included: ${modules.size}`);
}

main();
