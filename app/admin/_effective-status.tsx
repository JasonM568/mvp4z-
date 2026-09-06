"use client";

// 後台共用：「現在實際生效的是什麼」狀態卡
//
// 這個元件的存在是為了修掉一個真實事故：文件庫顯示「已納入 3741 字」整整一個月，
// 而那份文件一次都沒進過 prompt。畫面顯示的是「老師勾了什麼」，不是「報告用了什麼」。
//
// 所以這裡一律只顯示 /api/admin/effective-settings 回來的值——那支 API 問的是
// 報告管線本身用的 loader。**這個元件不做任何自己的推算**，一旦開始推算，
// 同樣的落差就會再長回來。

import { useEffect, useState } from "react";
import { adminFetch } from "./_shell";

export type EffectiveStatus = {
  ok: true;
  checked_at: string;
  cache_seconds: number;
  prompt: {
    live: "published" | "defaults";
    version_label: string;
    profile_id: string | null;
    fallback_reason: string | null;
    reason_label: string | null;
    draft: { version_label: string; updated_at: string } | null;
  };
  documents: {
    block_chars: number;
    reaching_prompt: boolean;
    ticked_count: number;
    ticked_chars: number;
    budget: number;
    truncated: boolean;
  };
  school: {
    live: "published" | "defaults";
    label: string;
    school_id: string;
    profile_id: string | null;
    fallback_reason: string | null;
    reason_label: string | null;
    decided_by: string | null;
    decided_at: string | null;
    draft: { version_label: string; updated_at: string; changes: string[] } | null;
  };
};

/** 讓三頁共用同一份資料來源，也讓發布後可以叫它重讀。 */
export function useEffectiveStatus() {
  const [status, setStatus] = useState<EffectiveStatus | null>(null);
  const [failed, setFailed] = useState(false);

  async function refresh() {
    try {
      const response = await adminFetch("/api/admin/effective-settings");
      const body = await response.json();
      if (!response.ok || !body?.ok) {
        setFailed(true);
        return;
      }
      setStatus(body as EffectiveStatus);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { status, failed, refresh };
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("zh-TW");
}

/** 天數差，用來說「草稿已經放了 N 天」——放越久越該被催。 */
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const CARD: React.CSSProperties = {
  margin: "18px 0",
  maxWidth: 760,
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.04)"
};

const WARN: React.CSSProperties = {
  ...CARD,
  border: "1px solid rgba(230,169,92,.55)",
  background: "rgba(230,169,92,.10)"
};

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginTop: 4 }}>
      <span className="muted" style={{ minWidth: 128 }}>{label}</span>
      <strong style={{ color: tone === "warn" ? "#e6a95c" : tone === "ok" ? "var(--green)" : undefined }}>
        {value}
      </strong>
    </div>
  );
}

/** 未發布草稿的催促區。changes 有值時逐條列出差異，讓老師知道自己改了什麼卻沒生效。 */
function PendingDraft({
  versionLabel,
  updatedAt,
  changes
}: {
  versionLabel: string;
  updatedAt: string;
  changes?: string[];
}) {
  const days = daysSince(updatedAt);
  return (
    <div style={WARN}>
      <div style={{ fontWeight: 900, color: "#e6a95c" }}>
        有一份草稿還沒發布{days >= 1 ? `，已經放了 ${days} 天` : ""}
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        版本「{versionLabel}」儲存於 {timeLabel(updatedAt)}。
        <strong>草稿不影響任何報告，要按「發布」才會生效。</strong>
      </p>
      {changes && changes.length > 0 && (
        <>
          <p className="muted" style={{ margin: "10px 0 4px" }}>草稿與目前生效值的差異：</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {changes.map((change) => (
              <li key={change} style={{ color: "#e6a95c" }}>{change}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * 報告內容設定（/admin/prompt-settings）用。
 */
export function PromptEffectiveStatus({ status, failed }: { status: EffectiveStatus | null; failed: boolean }) {
  if (failed) return <div style={CARD}><span className="muted">生效狀態讀取失敗，請重新整理頁面。</span></div>;
  if (!status) return <div style={CARD}><span className="muted">正在確認目前生效的設定⋯</span></div>;

  const { prompt } = status;
  const usingDefaults = prompt.live === "defaults";
  return (
    <>
      <div style={usingDefaults ? WARN : CARD}>
        <div className="label">報告內容｜現在實際生效的是</div>
        <Row
          label="生效版本"
          value={usingDefaults ? "程式內建預設值" : `已發布版本「${prompt.version_label}」`}
          tone={usingDefaults ? "warn" : "ok"}
        />
        {prompt.reason_label && <Row label="原因" value={prompt.reason_label} tone="warn" />}
        <p className="muted" style={{ margin: "8px 0 0" }}>
          這一行問的是報告管線本身，不是後台的勾選狀態。發布後最多 {status.cache_seconds} 秒全面生效。
        </p>
      </div>
      {prompt.draft && (
        <PendingDraft versionLabel={prompt.draft.version_label} updatedAt={prompt.draft.updated_at} />
      )}
    </>
  );
}

/**
 * 老師文件（/admin/documents）用。
 *
 * 這頁是事故現場：原本的「目前納入 Prompt 的字數」是前端從勾選狀態自己加總的，
 * 所以在文件一次都沒進過 prompt 的那一個月裡，它依然顯示 3741 字。
 * 現在 block_chars 來自報告真的會拿到的那個字串。
 */
export function DocumentsEffectiveStatus({ status, failed }: { status: EffectiveStatus | null; failed: boolean }) {
  if (failed) return <div style={CARD}><span className="muted">生效狀態讀取失敗，請重新整理頁面。</span></div>;
  if (!status) return <div style={CARD}><span className="muted">正在確認文件是否真的進入 Prompt⋯</span></div>;

  const { documents } = status;
  const mismatch = documents.ticked_count > 0 && !documents.reaching_prompt;
  return (
    <div style={mismatch || documents.truncated ? WARN : CARD}>
      <div className="label">老師文件｜現在實際進入 Prompt 的是</div>
      <Row
        label="實際送出"
        value={documents.reaching_prompt ? `${documents.block_chars.toLocaleString()} 字` : "沒有任何文件進入 Prompt"}
        tone={documents.reaching_prompt ? "ok" : "warn"}
      />
      <Row
        label="目前勾選"
        value={`${documents.ticked_count} 份，共 ${documents.ticked_chars.toLocaleString()} 字（上限 ${documents.budget.toLocaleString()} 字）`}
      />
      {mismatch && (
        <p style={{ margin: "8px 0 0", color: "#e6a95c", fontWeight: 700 }}>
          已勾選文件，但報告實際上沒有收到任何內容。請把這個狀況回報給工程，不要只依勾選狀態判斷。
        </p>
      )}
      {documents.truncated && (
        <p style={{ margin: "8px 0 0", color: "#e6a95c" }}>
          勾選字數超過上限，超出的部分不會進入 Prompt。請減少勾選份數。
        </p>
      )}
      <p className="muted" style={{ margin: "8px 0 0" }}>
        「實際送出」是報告管線真的會拿到的字串長度（含文件標題與說明行），
        與「目前勾選」的原始字數本來就不會完全相同；重點是它不能是 0。
      </p>
    </div>
  );
}

/**
 * 排盤流派設定（/admin/school-settings）用。
 */
export function SchoolEffectiveStatus({ status, failed }: { status: EffectiveStatus | null; failed: boolean }) {
  if (failed) return <div style={CARD}><span className="muted">生效狀態讀取失敗，請重新整理頁面。</span></div>;
  if (!status) return <div style={CARD}><span className="muted">正在確認目前生效的流派⋯</span></div>;

  const { school } = status;
  const usingDefaults = school.live === "defaults";
  const unsigned = !school.decided_by;
  return (
    <>
      <div style={usingDefaults || unsigned ? WARN : CARD}>
        <div className="label">排盤流派｜現在實際生效的是</div>
        <Row label="生效流派" value={school.label} tone={usingDefaults ? "warn" : "ok"} />
        {school.reason_label && <Row label="原因" value={school.reason_label} tone="warn" />}
        <Row
          label="簽核狀態"
          value={unsigned ? "尚未經老師簽核" : `${school.decided_by}　${school.decided_at || ""}`}
          tone={unsigned ? "warn" : "ok"}
        />
        <p className="muted" style={{ margin: "8px 0 0" }}>
          這一行問的是排盤引擎本身。發布後最多 {status.cache_seconds} 秒全面生效，舊報告不受影響。
        </p>
      </div>
      {school.draft && (
        <PendingDraft
          versionLabel={school.draft.version_label}
          updatedAt={school.draft.updated_at}
          changes={school.draft.changes}
        />
      )}
    </>
  );
}
