import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

let gitDir;
try {
  gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim();
} catch {
  process.exit(0);
}

mkdirSync(`${gitDir}/hooks`, { recursive: true });

const node = process.execPath.replaceAll("\\", "/");
const preCommit = `#!/bin/sh
"${node}" scripts/check-ownership.mjs --staged
`;
const commitMsg = `#!/bin/sh
"${node}" scripts/check-commit-msg.mjs "$1"
`;

writeFileSync(`${gitDir}/hooks/pre-commit`, preCommit);
writeFileSync(`${gitDir}/hooks/commit-msg`, commitMsg);
try {
  chmodSync(`${gitDir}/hooks/pre-commit`, 0o755);
  chmodSync(`${gitDir}/hooks/commit-msg`, 0o755);
} catch {
  // Windows 不依赖可执行位，Git 仍会调用 hook。
}
