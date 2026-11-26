import styles from "./EmptyState.module.css";

type Props = {
  onCreate: () => void;
  blocked?: boolean;
};

export function EmptyState({ onCreate, blocked = false }: Props) {
  return (
    <div className={styles.box}>
      <p className={styles.title}>这一天还没有计划</p>
      <p className={styles.hint}>
        {blocked
          ? "计划读写还没接上后端。等后端合并后，这里就能新建并保存。"
          : "写下今天要做的事，按开始时间排在上午、下午或晚间。"}
      </p>
      {!blocked ? (
        <button type="button" className={styles.action} onClick={onCreate}>
          添加第一条计划
        </button>
      ) : null}
    </div>
  );
}
