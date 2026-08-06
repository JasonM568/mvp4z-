// 階段三：掃描動畫頁（Loading）— 把 60~90 秒等待變成「四引擎正在運作」的體驗
// 後端是一次同步 POST、無進度回報，這裡是擬真進度：
// 前 70 秒依啟用術數均分爬到 90%，之後「整合定稿」以龜速爬到 97% 徘徊等回應；
// fetch 完成（done）且至少展示 6 秒後跳 100%，停 900ms 再進報告頁。
// 注意：fallback 兜底稿是 ok:true，不會走 errorMsg 這條路。

import { useEffect, useRef, useState } from "react";
import { ASPECT_CONFIG, type AspectKey } from "../_aspects";

const RAMP_SECONDS = 70;
const RAMP_PCT = 90;
const MIN_SHOW_SECONDS = 6;
const MICRO_COPY = [
  "四套古法交叉驗算中...",
  "同一件事，四個維度同時檢視...",
  "校準你的專屬順轉路徑..."
];

export function ScanningStep({
  aspects,
  done,
  errorMsg,
  onComplete,
  onBack
}: {
  aspects: AspectKey[];
  done: boolean;
  errorMsg: string | null;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (errorMsg) return;
    const timer = setInterval(() => setElapsed((e) => e + 0.25), 250);
    return () => clearInterval(timer);
  }, [errorMsg]);

  // 完成跳轉必須 fire-and-forget：elapsed 每 250ms 變動會重跑此 effect，
  // 若把 setTimeout 放進 cleanup 會被反覆清掉、永遠跳不到報告頁。
  // 用 ref 保證只觸發一次。
  useEffect(() => {
    if (!done || errorMsg || completedRef.current || elapsed < MIN_SHOW_SECONDS) return;
    completedRef.current = true;
    setFinishing(true);
    window.setTimeout(onComplete, 900);
  }, [done, errorMsg, elapsed, onComplete]);

  const stageLabels = [
    ...aspects.map((k) => ASPECT_CONFIG[k].scanLabel),
    "整合：交叉驗證與定稿"
  ];
  const perStage = RAMP_SECONDS / aspects.length;
  const stageIdx = finishing
    ? stageLabels.length - 1
    : Math.min(stageLabels.length - 1, Math.floor(elapsed / perStage));

  let pct: number;
  if (finishing) {
    pct = 100;
  } else if (elapsed <= RAMP_SECONDS) {
    pct = (elapsed / RAMP_SECONDS) * RAMP_PCT;
  } else {
    pct = Math.min(97, RAMP_PCT + (elapsed - RAMP_SECONDS) * 0.1);
  }
  const pctText = Math.round(pct);
  const microIdx = Math.floor(elapsed / 4) % MICRO_COPY.length;
  const currentAspect = stageIdx < aspects.length ? ASPECT_CONFIG[aspects[stageIdx]] : null;

  if (errorMsg) {
    return (
      <section className="section xf-scan">
        <div className="wrap xf-scan-wrap">
          <div className="xf-step-hint">步驟 2/3：四象掃描</div>
          <article className="panel" style={{ borderColor: "rgba(248,113,113,.5)" }}>
            <h2 style={{ marginTop: 0 }}>掃描未完成</h2>
            <p className="lead" style={{ fontSize: 16 }}>系統提示：{errorMsg}</p>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>本次未產出報告、未扣點。請調整後重新啟動掃描。</p>
            <button className="btn primary" onClick={onBack} style={{ marginTop: 10 }}>
              返回修改
            </button>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="section xf-scan">
      <div className="wrap xf-scan-wrap">
        <div className="xf-step-hint">步驟 2/3：四象掃描中</div>

        <div className="xf-compass xf-compass-scan" aria-hidden>
          <div className="xf-compass-ring xf-compass-ring-outer" />
          <div className="xf-compass-ring xf-compass-ring-inner" />
          <div className="xf-compass-core">{finishing ? "成" : currentAspect ? currentAspect.name[0] : "定"}</div>
        </div>

        <div className="xf-scan-stage-current">
          {finishing ? "順轉路徑生成完畢！" : stageLabels[stageIdx]}
        </div>

        <div className="xf-progress">
          <div className="xf-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="xf-progress-num">{pctText}%</div>

        <ul className="xf-scan-stages">
          {stageLabels.map((label, i) => {
            const state = finishing || i < stageIdx ? "done" : i === stageIdx ? "active" : "todo";
            return (
              <li key={label} className={`xf-scan-stage xf-scan-stage-${state}`}>
                <span className="xf-scan-stage-icon">{state === "done" ? "✓" : state === "active" ? "●" : "○"}</span>
                {label}
              </li>
            );
          })}
        </ul>

        <p className="xf-scan-micro">{MICRO_COPY[microIdx]}</p>
        {elapsed > 120 && !finishing && (
          <p className="xf-scan-long">仍在深度校核，最長約需 4～5 分鐘，請勿關閉此頁面。</p>
        )}
      </div>
    </section>
  );
}
