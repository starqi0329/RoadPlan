import { useState } from "react";
import { commands, CONTRACT_VERSION } from "./bindings";

type Clock = { now: string; date: string; minute: number };

export function App() {
  const [clock, setClock] = useState<Clock | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readNow() {
    setError(null);
    try {
      setClock(await commands.getNow());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读不到当前时间");
    }
  }

  return (
    <main>
      <h1>时序</h1>
      <p>第 0 阶段骨架。契约 {CONTRACT_VERSION}。计划、目标和复盘从切片 1 开始接。</p>
      <button type="button" onClick={() => void readNow()}>
        读取当前时间
      </button>
      {clock ? (
        <p>
          {clock.date} · 第 {clock.minute} 分钟
        </p>
      ) : null}
      {error ? <p>{error}</p> : null}
    </main>
  );
}
