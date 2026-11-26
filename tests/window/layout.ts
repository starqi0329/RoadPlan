import type { WindowFrame, WindowLayout } from "./types.ts";

function isFrame(value: unknown): value is WindowFrame {
  if (value === null || typeof value !== "object") return false;
  const frame = value as WindowFrame;
  return (
    typeof frame.x === "number" &&
    typeof frame.y === "number" &&
    typeof frame.width === "number" &&
    typeof frame.height === "number"
  );
}

/** 只核对契约里的字段形状，不核对默认像素。 */
export function isWindowLayout(value: unknown): value is WindowLayout {
  if (value === null || typeof value !== "object") return false;
  const layout = value as WindowLayout;
  return (
    isFrame(layout.main) &&
    (layout.pin === null || isFrame(layout.pin)) &&
    (layout.capsule === null || isFrame(layout.capsule)) &&
    typeof layout.mainCollapsed === "boolean" &&
    typeof layout.pinVisible === "boolean" &&
    typeof layout.capsuleVisible === "boolean"
  );
}
