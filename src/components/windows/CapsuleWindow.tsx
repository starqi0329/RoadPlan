import { hideCapsule, setDragging, showMain } from "../../api/window";
import { useActiveNow } from "../../hooks/useActiveNow";
import { formatMinute } from "../../lib/format";
import styles from "./CapsuleWindow.module.css";

type Props = {
  onOpenDemo?: () => void;
};

export function CapsuleWindow({ onOpenDemo }: Props) {
  const { now, activePlan } = useActiveNow();

  async function openMain() {
    await showMain();
    await hideCapsule();
    onOpenDemo?.();
  }

  return (
    <button
      type="button"
      className={styles.capsule}
      title="打开主窗"
      onClick={() => void openMain()}
      onPointerDown={() => {
        void setDragging(true);
      }}
      onPointerUp={() => {
        void setDragging(false);
      }}
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.brand}>时序</span>
      <span className={styles.status}>{activePlan ? activePlan.title : "空闲"}</span>
      <span className={styles.time}>{now ? formatMinute(now.minute) : "--:--"}</span>
    </button>
  );
}
