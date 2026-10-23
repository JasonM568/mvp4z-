"use client";

// 六爻搖卦：案主親手點六次，每次代表擲三枚錢產生一爻，由初爻往上排。
// 每一搖都記下時間戳；第一搖的時刻就是全報告的問事時間（見 lib/divination/casting.ts）。
// 沒搖滿六次不能送出，後端另外驗證，不信任前端。
//
// 儀式感：每一搖都有三枚錢拋擲的動畫與停頓，落定後才在卦上現出那一爻，
// 手機會有短震動；動爻（老陽、老陰）會換色並加框。動畫時長約一秒，
// 不是為了好看而拖慢：搖卦本來就是一個需要靜下來的動作。

import { useEffect, useRef, useState } from "react";
import { formatTaipeiClock, yaoFromCoins } from "@/lib/divination/casting";

type Throw = { at: string; yao: string };

const POSITION_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
const ORDINALS = ["第一", "第二", "第三", "第四", "第五", "第六"];

/** 拋擲動畫時長（毫秒）。要與 decision.css 的 xf-coin-toss 一致。 */
const TOSS_MS = 1100;

const HEADS_OF: Record<string, number> = { 老陰: 0, 少陽: 1, 少陰: 2, 老陽: 3 };

function isYang(yao: string) {
  return yao === "少陽" || yao === "老陽";
}

function isMoving(yao: string) {
  return yao === "老陽" || yao === "老陰";
}

/** 三枚錢各自擲一次，用瀏覽器的加密亂數源而不是 Math.random。 */
function throwThreeCoins(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const heads = bytes.filter((b) => b % 2 === 0).length;
  return yaoFromCoins(heads);
}

/** 依爻象排出三枚錢的正反面（正面的個數固定，位置隨機）。 */
function coinFaces(yao: string): boolean[] {
  const heads = HEADS_OF[yao] ?? 0;
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [0, 1, 2]
    .map((i) => ({ face: i < heads, order: bytes[i] }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.face);
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}

export function CastingPanel({
  throws,
  onChange,
  onNext
}: {
  throws: Throw[];
  onChange: (next: Throw[]) => void;
  /** 六爻搖滿後帶會員到下一個待完成的欄位。 */
  onNext?: () => void;
}) {
  const done = throws.length >= 6;
  // 拋擲中的那一搖：動畫期間才存在，落定後才寫進 throws。
  const [tossing, setTossing] = useState<{ at: string; yao: string; faces: boolean[] } | null>(null);
  const [lastFaces, setLastFaces] = useState<boolean[] | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throwsRef = useRef(throws);
  throwsRef.current = throws;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function cast() {
    if (done || tossing) return;
    const yao = throwThreeCoins();
    const at = new Date().toISOString();
    const faces = coinFaces(yao);
    setTossing({ at, yao, faces });
    vibrate(25);
    timer.current = setTimeout(() => {
      const next = [...throwsRef.current, { at, yao }];
      onChange(next);
      setLastFaces(faces);
      setJustAdded(next.length - 1);
      setTossing(null);
      vibrate(isMoving(yao) ? [40, 60, 40] : 40);
      // 搖滿六次：停一下讓會員看見卦成，再帶去下一步，避免停在這裡不知所措。
      if (next.length === 6) setTimeout(() => onNextRef.current?.(), 1600);
    }, TOSS_MS);
  }

  function reset() {
    if (tossing) return;
    onChange([]);
    setLastFaces(null);
    setJustAdded(null);
  }

  const firstAt = throws[0] ? formatTaipeiClock(new Date(throws[0].at)) : null;
  const nextIndex = Math.min(throws.length, 5);
  const shown = tossing ? tossing.faces : lastFaces;
  const latest = throws.length > 0 ? throws[throws.length - 1] : null;

  return (
    <div className="xf-casting" id="councilCasting">
      <div className="xf-field-label">
        親手搖卦<span className="xf-required">（六爻必填）</span>
      </div>
      <p className="xf-casting-guide">
        先靜下來，心中默想你的問題，一次只想一件事。
        準備好了就點下方的大按鈕，擲三枚錢，共搖六次，由最下面的初爻往上排。
        <b>第一次搖卦的時刻，就是這份報告的問事時間。</b>
      </p>

      <div className={"xf-casting-stage" + (tossing ? " tossing" : "") + (done ? " done" : "")} aria-live="polite">
        <div className="xf-coins" aria-hidden>
          {[0, 1, 2].map((i) => {
            const face = shown ? shown[i] : true;
            return (
              <span
                key={i}
                className={"xf-coin" + (tossing ? " flying" : "") + (face ? " heads" : " tails")}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <i>{face ? "正" : "反"}</i>
              </span>
            );
          })}
        </div>
        <div className="xf-casting-status">
          {tossing
            ? `擲出第 ${throws.length + 1} 搖⋯`
            : done
              ? "六爻已成，卦已立"
              : latest
                ? `${ORDINALS[throws.length - 1]}搖：${latest.yao}${isMoving(latest.yao) ? "（動爻）" : ""}`
                : "靜心，開始搖第一爻"}
        </div>
      </div>

      <div className="xf-casting-lines">
        {[5, 4, 3, 2, 1, 0].map((i) => {
          const t = throws[i];
          return (
            <div
              key={i}
              className={"xf-casting-line" + (t ? "" : " empty") + (justAdded === i ? " fresh" : "") + (t && isMoving(t.yao) ? " moving" : "")}
            >
              <span className="xf-casting-pos">{POSITION_NAMES[i]}</span>
              <span className={"xf-casting-bar " + (t ? (isYang(t.yao) ? "yang" : "yin") : "yang")} aria-hidden>
                <i />
                <i />
              </span>
              <span className="xf-casting-name">{t ? `${t.yao}${isMoving(t.yao) ? "・動" : ""}` : "尚未搖出"}</span>
            </div>
          );
        })}
      </div>

      <button type="button" className="xf-cast-btn" onClick={cast} disabled={done || Boolean(tossing)}>
        {done ? "六爻已成" : tossing ? "擲錢中…" : `搖${POSITION_NAMES[nextIndex]}（${ORDINALS[nextIndex]}搖，${throws.length}/6）`}
      </button>

      {done && (
        <div className="xf-casting-next" role="status">
          <strong>✓ 六爻已成，卦已立。</strong>
          <p>
            還沒結束：接下來請確認「出生年月日時」與「性別」，勾選同意扣點，最後按畫面最下方的「生成天機書」。
            案主姓名與背景補充是選填，不填也能生成。
          </p>
          {onNext && (
            <button type="button" className="xf-casting-next-btn" onClick={onNext}>
              前往下一步 ↓
            </button>
          )}
        </div>
      )}

      <div className="xf-casting-meta">
        {throws.length > 0 && (
          <button type="button" className="xf-casting-reset" onClick={reset} disabled={Boolean(tossing)}>
            重新搖卦
          </button>
        )}
        {firstAt && <span>問事時間：{firstAt}（台北時間）</span>}
      </div>
    </div>
  );
}
