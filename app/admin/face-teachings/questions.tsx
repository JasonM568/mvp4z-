"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../_shell";

export type ReviewQuestion = {
  id: string;
  question_id: string;
  topic: string;
  title: string;
  body: string;
  source_ref: string;
  related_rule_ids: string[];
  status: "open" | "answered" | "deferred";
  answer: string;
  answered_by_name: string;
  answered_at: string | null;
};

const STATUS_LABELS: Record<ReviewQuestion["status"], { label: string; color: string; background: string }> = {
  open: { label: "待回覆", color: "#f0dcae", background: "rgba(213,173,96,.2)" },
  answered: { label: "已回覆", color: "#cce3b8", background: "rgba(104,145,76,.22)" },
  deferred: { label: "暫緩", color: "var(--muted)", background: "rgba(255,255,255,.07)" }
};

/**
 * 待老師確認事項。
 * 這些問題原本只寫在 repo 的 SPEC markdown，老師看不到也無處回覆；
 * 搬進後台後，回覆與具名紀錄一起保存，之後調整規則時可回溯是誰在什麼時候決定的。
 */
export function ReviewQuestions({ defaultName }: { defaultName: string }) {
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/face-review-questions");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "讀取失敗");
      setQuestions(body.questions || []);
      if (body.tableMissing) setMessage("face_review_questions 資料表尚未建立。");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(question: ReviewQuestion, answer: string, name: string, status: ReviewQuestion["status"]) {
    setBusy(true);
    try {
      const response = await adminFetch("/api/admin/face-review-questions", {
        method: "PATCH",
        body: JSON.stringify({ id: question.id, answer, answeredByName: name, status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      setMessage(`已儲存「${question.title}」的回覆。`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="admin-empty">讀取中⋯</p>;

  const open = questions.filter((item) => item.status === "open").length;

  return (
    <section style={{ marginTop: 8 }}>
      <p className="lead" style={{ marginTop: 0 }}>
        需要老師裁示才能定案的事項。回覆會連同姓名與時間一起保存，之後調整判讀規則時可以回溯依據。
        目前待回覆 <strong>{open}</strong> 題，共 {questions.length} 題。
      </p>
      {message && <div className="admin-inline-message">{message}</div>}

      <div style={{ display: "grid", gap: 14 }}>
        {questions.length === 0 && <p className="admin-empty">沒有待確認事項。</p>}
        {questions.map((question) => (
          <QuestionCard key={question.id} question={question} defaultName={defaultName} busy={busy} onSave={save} />
        ))}
      </div>
    </section>
  );
}

function QuestionCard({ question, defaultName, busy, onSave }: {
  question: ReviewQuestion;
  defaultName: string;
  busy: boolean;
  onSave: (question: ReviewQuestion, answer: string, name: string, status: ReviewQuestion["status"]) => void;
}) {
  const [open, setOpen] = useState(question.status === "open");
  const [answer, setAnswer] = useState(question.answer);
  const [name, setName] = useState(question.answered_by_name || defaultName);
  const tag = STATUS_LABELS[question.status];

  return (
    <article style={{
      padding: 17,
      borderRadius: 12,
      border: `1px solid ${question.status === "answered" ? "rgba(104,145,76,.4)" : "rgba(213,173,96,.32)"}`,
      background: "rgba(0,0,0,.22)"
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ ...tag, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>{tag.label}</span>
        {question.topic && <span className="muted" style={{ fontSize: 13 }}>{question.topic}</span>}
        <button
          onClick={() => setOpen((value) => !value)}
          style={{ background: "none", border: 0, color: "var(--text)", cursor: "pointer", fontSize: 16, fontWeight: 800, textAlign: "left", padding: 0, flex: "1 1 260px" }}
        >
          {open ? "▾" : "▸"} {question.title}
        </button>
      </div>

      {open && (
        <>
          <p style={{ margin: "12px 0 0", color: "var(--text)", fontSize: 14, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{question.body}</p>
          {question.source_ref && <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>出處：{question.source_ref}</p>}
          {question.related_rule_ids.length > 0 && (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              相關規則：{question.related_rule_ids.join("、")}
            </p>
          )}

          <label style={{ display: "block", marginTop: 14 }}>老師回覆
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              placeholder="請寫下裁示內容，例如：以圖示為準，例句為誤植。"
              style={{
                width: "100%", boxSizing: "border-box", marginTop: 6, padding: 12,
                border: "1px solid rgba(255,255,255,.16)", borderRadius: 10,
                background: "rgba(0,0,0,.3)", color: "var(--text)", font: "inherit", lineHeight: 1.7, resize: "vertical"
              }}
            />
          </label>

          <div className="admin-form-grid" style={{ marginTop: 10 }}>
            <label>回覆人姓名<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例：沈全榮老師" /></label>
          </div>

          {question.answered_at && (
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              上次回覆：{new Date(question.answered_at).toLocaleString("zh-TW")}
              {question.answered_by_name ? `（${question.answered_by_name}）` : ""}
            </p>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="admin-action-btn" disabled={busy} onClick={() => onSave(question, answer, name, "answered")}>
              儲存並標為已回覆
            </button>
            <button className="admin-action-btn ghost" disabled={busy} onClick={() => onSave(question, answer, name, "open")}>
              只存草稿
            </button>
            <button className="admin-action-btn ghost" disabled={busy} onClick={() => onSave(question, answer, name, "deferred")}>
              暫緩
            </button>
          </div>
        </>
      )}
    </article>
  );
}
