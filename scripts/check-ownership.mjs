import { execSync } from "node:child_process";

const organizer = /^(main|master|HEAD)$|^(slice|spike|contract)\//;

const owners = {
  fe: [
    /^src\/(?!bindings\.ts$).+/,
    /^index\.html$/,
    /^vite\.config\.ts$/,
    /^tsconfig.*$/,
    /^eslint\.config\.js$/,
    /^prettier\.config\.js$/,
    /^vitest\.config\.ts$/,
    /^package\.json$/,
    /^pnpm-lock\.yaml$/,
  ],
  be: [/^src-tauri\//, /^src\/bindings\.ts$/],
  qa: [/^tests\//, /^playwright\.config\.ts$/],
};

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function changedFiles() {
  const staged = process.argv.includes("--staged");
  if (staged) {
    const out = git("diff --cached --name-only --diff-filter=ACMR");
    return out ? out.split(/\r?\n/) : [];
  }
  try {
    const out = git("diff --name-only --diff-filter=ACMR main...HEAD");
    return out ? out.split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

const branch = git("symbolic-ref --short HEAD");
const files = changedFiles();

if (organizer.test(branch)) {
  console.log(`ownership: ${branch} 是组织者分支，跳过路径检查（${files.length} 个文件）`);
  process.exit(0);
}

const role = branch.split("/")[0];
const patterns = owners[role];
if (!patterns) {
  console.error(`ownership: 分支 ${branch} 必须以 fe/、be/ 或 qa/ 开头`);
  process.exit(1);
}

const denied = files.filter((file) => !patterns.some((pattern) => pattern.test(file)));
if (denied.length > 0) {
  console.error(`ownership: ${role} 不能修改这些文件:`);
  for (const file of denied) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`ownership: ${role} 的 ${files.length} 个文件都在允许范围内`);
