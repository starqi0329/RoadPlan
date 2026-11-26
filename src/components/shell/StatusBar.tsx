import styles from "./StatusBar.module.css";

type Props = {
  doneCount: number;
  totalCount: number;
  storageHint?: string;
};

export function StatusBar({ doneCount, totalCount, storageHint = "本地存储" }: Props) {
  return (
    <footer className={styles.bar}>
      <span>
        存储：<b>{storageHint}</b>
      </span>
      <span>
        数据表：<b>年 / 月 / 周 / 日</b>
      </span>
      <div className={styles.right}>
        <span>
          完成度{" "}
          <b>
            {doneCount}/{totalCount}
          </b>
        </span>
      </div>
    </footer>
  );
}
