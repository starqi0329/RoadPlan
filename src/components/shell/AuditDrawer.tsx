import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listenAuditChanged, listAudit } from "../../api/audit";
import { isAppError } from "../../api/result";
import type { AuditEvent } from "../../bindings";
import { isUnimplemented, translateAppError } from "../../errors/appError";
import { auditActionLabel, auditEntityLabel, formatAuditTime } from "../../lib/auditLabels";
import styles from "./AuditDrawer.module.css";

const PAGE_SIZE = 20;

type Props = {
  open: boolean;
  onClose: () => void;
  onJumpPlan?: (planId: string) => void;
};

export function AuditDrawer({ open, onClose, onJumpPlan }: Props) {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendGap, setBackendGap] = useState(false);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listAudit(PAGE_SIZE, null);
      setItems(page.items);
      setTotal(page.total);
    } catch (err) {
      if (isAppError(err) && isUnimplemented(err)) {
        setBackendGap(true);
        setItems([]);
        setTotal(0);
      } else if (isAppError(err)) {
        setError(translateAppError(err));
      } else {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadFirst();
  }, [open, loadFirst]);

  useEffect(() => {
    if (!open) return;
    return listenAuditChanged(() => {
      void loadFirst();
    });
  }, [open, loadFirst]);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listAudit(PAGE_SIZE, last.id);
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      if (isAppError(err)) setError(translateAppError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div
      className={`${styles.drawer} ${open ? styles.open : ""}`}
      role="dialog"
      aria-modal="false"
      aria-hidden={!open}
      aria-labelledby="audit-drawer-title"
    >
      <header className={styles.head}>
        <div>
          <h3 id="audit-drawer-title">操作记录</h3>
          <p className={styles.sub}>按时间倒序 · 纯文本摘要，可追溯</p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>

      <div className={styles.body}>
        {!isTauri() ? (
          <p className={styles.banner}>浏览器演示数据：关掉页面会清空，不会写入本地数据库。</p>
        ) : null}
        {backendGap ? (
          <p className={styles.gap}>操作记录命令还没接上后端。浏览器可用演示数据。</p>
        ) : null}

        {loading ? <p className={styles.muted}>正在读取操作记录…</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {!loading && items.length === 0 ? (
          <div className={styles.empty}>
            <h4>还没有操作记录</h4>
            <p>新建、完成、跳过计划或写复盘后，会按时间出现在这里。</p>
          </div>
        ) : null}

        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.badge}>
                  {auditActionLabel(item.action)} · {auditEntityLabel(item.entity)}
                </span>
                <time dateTime={item.at}>{formatAuditTime(item.at)}</time>
              </div>
              <div className={styles.title}>{item.entityTitle}</div>
              <p className={styles.summary}>{item.summary}</p>
              {item.entity === "plan" && onJumpPlan ? (
                <button
                  type="button"
                  className={styles.jump}
                  onClick={() => {
                    onJumpPlan(item.entityId);
                    onClose();
                  }}
                >
                  转到日计划并高亮
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {items.length > 0 ? (
          <div className={styles.footer}>
            {hasMore ? (
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "加载中…" : "加载更早"}
              </button>
            ) : (
              <span className={styles.muted}>没有更早的记录了（共 {total} 条）</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
