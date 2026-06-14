const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(projectRoot, "package.json"));
const version = packageJson.version;
const distDir = path.join(projectRoot, "dist-desktop");

const keep = new Set([
  "win-unpacked",
  `WGI-POS-Setup-${version}-x64.exe`,
  `WGI-POS-Setup-${version}-x64.exe.blockmap`,
  `WGI-POS-Portable-${version}-x64.exe`,
]);

function isCleanableBuildFile(name) {
  return (
    name === "builder-debug.yml" ||
    /^WGI-POS-Setup-.*-x64\.exe$/.test(name) ||
    /^WGI-POS-Setup-.*-x64\.exe\.blockmap$/.test(name) ||
    /^WGI-POS-Portable-.*-x64\.exe$/.test(name)
  );
}

if (!fs.existsSync(distDir)) {
  console.log("No dist-desktop folder found. Nothing to clean.");
  process.exit(0);
}

const removed = [];

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (!entry.isFile() || keep.has(entry.name) || !isCleanableBuildFile(entry.name)) {
    continue;
  }

  const filePath = path.join(distDir, entry.name);
  fs.rmSync(filePath, { force: true });
  removed.push(entry.name);
}

if (removed.length === 0) {
  console.log("No old desktop build files to clean.");
} else {
  console.log(`Cleaned ${removed.length} old desktop build file(s):`);
  for (const name of removed) console.log(`- ${name}`);
}
