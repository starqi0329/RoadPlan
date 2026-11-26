import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const file = process.argv[2];
const message = readFileSync(file, "utf8").split(/\r?\n/)[0] ?? "";
const pattern = /^(feat|fix|test|refactor|docs|chore|contract)(\([a-z0-9-]+\))?: \S+/;

if (!pattern.test(message)) {
  console.error("提交说明不符合规范。分支名用英文；提交说明用中文。示例: feat(be): 计划状态推导与时间门槛 [S1][FR-05]");
  console.error(`实际: ${message}`);
  process.exit(1);
}

if (message.startsWith("contract")) {
  const branch = execSync("git symbolic-ref --short HEAD", { encoding: "utf8" }).trim();
  if (branch !== "main" && branch !== "master") {
    console.error("contract 类型的提交只能由组织者在 main 上做");
    process.exit(1);
  }
}
