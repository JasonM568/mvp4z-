"use client";

// 六爻搖卦：案主親手點六次，每次代表擲三枚錢產生一爻，由初爻往上排。
// 每一搖都記下時間戳；第一搖的時刻就是全報告的問事時間（見 lib/divination/casting.ts）。
// 沒搖滿六次不能送出，後端另外驗證，不信任前端。

import { formatTaipeiClock, yaoFromCoins } from "@/lib/divination/casting";

type Throw = { at: string; yao: string };

const POSITION_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

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

export function CastingPanel({
  throws,
  onChange
}: {
  throws: Throw[];
  onChange: (next: Throw[]) => void;
}) {
  const done = throws.length >= 6;

  function cast() {
    if (done) return;
    onChange([...throws, { at: new Date().toISOString(), yao: throwThreeCoins() }]);
  }

  const firstAt = throws[0] ? formatTaipeiClock(new Date(throws[0].at)) : null;

  return (
    <div className="xf-casting" id="councilCasting">
      <div className="xf-field-label">
        親手搖卦<span className="xf-required">（六爻必填）</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 12px" }}>
        心中默想你的問題，然後點「搖一次」，共搖六次，由最下面的初爻開始往上排。
        每一次代表擲三枚錢。第一次搖卦的時刻，就是這份報告的問事時間。
      </p>

      <div className="xf-casting-lines" aria-live="polite">
        {[5, 4, 3, 2, 1, 0].map((i) => {
          const t = throws[i];
          return (
            <div key={i} className={"xf-casting-line" + (t ? "" : " empty")}>
              <span className="xf-casting-pos">{POSITION_NAMES[i]}</span>
              {t ? (
                <>
                  <span className={"xf-casting-bar " + (isYang(t.yao) ? "yang" : "yin")} aria-hidden>
                    <i />
                    <i />
                  </span>
                  <span className="xf-casting-name">
                    {t.yao}
                    {isMoving(t.yao) ? "（動爻）" : ""}
                  </span>
                </>
              ) : (
                <span className="xf-casting-name" style={{ color: "var(--muted)" }}>
                  尚未搖出
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14, alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={cast} disabled={done}>
          {done ? "六爻已成" : `搖一次（${throws.length}/6）`}
        </button>
        {throws.length > 0 && (
          <button type="button" className="btn" onClick={() => onChange([])}>
            重新搖卦
          </button>
        )}
        {firstAt && (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            問事時間：{firstAt}（台北時間）
          </span>
        )}
      </div>
    </div>
  );
}
