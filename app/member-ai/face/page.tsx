"use client";

import "./face.css";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { track } from "@vercel/analytics/react";

type Step = "landing" | "capture" | "ready" | "report";
type Mode = "self" | "other";
type PublicQuality = {
  passed: boolean;
  faceCount: number;
  sharpness: "good" | "acceptable" | "retake";
  lighting: "acceptable" | "too_dark" | "too_bright";
  pose: "front" | "retake";
  reasons: string[];
};

const TOKEN_KEY = "xunfeng_member_token";
const CONSENT_VERSION = "2026-08-01";

export default function FaceAnalysisPage() {
  const [step, setStep] = useState<Step>("landing");
  const [mode, setMode] = useState<Mode>("self");
  const [subjectAge, setSubjectAge] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [quality, setQuality] = useState<PublicQuality | null>(null);
  const [chargeConsent, setChargeConsent] = useState(false);
  const [reportText, setReportText] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => () => stopCamera(), []);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function goToLanding() {
    stopCamera();
    setStep("landing");
    setNotice("");
  }

  async function openCamera() {
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("這個瀏覽器無法開啟即時相機，請改用「拍照或選擇照片」。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode === "self" ? "user" : "environment" },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setNotice("無法取得相機權限，您仍可使用手機原生拍照或從相簿選擇。");
    }
  }

  function useFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setNotice("請選擇 JPEG、PNG 或 WebP 圖片。");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    requestIdRef.current = null;
    setPreviewUrl(URL.createObjectURL(file));
    setNotice("");
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) useFile(file);
    event.target.value = "";
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      useFile(new File([blob], "face-capture.jpg", { type: "image/jpeg" }));
      stopCamera();
    }, "image/jpeg", 0.92);
  }

  async function createAnalysisRun() {
    if (!selectedFile) return setNotice("請先拍攝或選擇照片。");
    if (!privacyConsent) return setNotice("請先同意照片處理與隱私說明。");
    if (mode === "other" && !thirdPartyConsent) return setNotice("請確認已取得照片本人同意。");

    const token = window.localStorage.getItem(TOKEN_KEY) || "";
    if (!token) {
      window.location.href = "/login?next=/member-ai/face";
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/face-analysis/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requestId: (requestIdRef.current ||= crypto.randomUUID()),
          mode,
          subjectAge: subjectAge ? Number(subjectAge) : null,
          consentVersion: CONSENT_VERSION,
          thirdPartyConsent: mode === "other" ? thirdPartyConsent : false
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "無法建立分析任務");
      const upload = new FormData();
      upload.append("image", selectedFile);
      const uploadResponse = await fetch(`/api/face-analysis/runs/${data.runId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: upload
      });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadData.error || "照片品質檢測失敗");
      setQuality(uploadData.quality || null);
      if (!uploadData.quality?.passed) {
        track("face_quality_failed", {
          reasons: (uploadData.quality?.reasons || []).slice(0, 4).join(",") || "unknown"
        });
        setRunId(null);
        setNotice(qualityMessage(uploadData.quality?.reasons || []));
        return;
      }
      setRunId(data.runId);
      track("face_quality_passed");
      setStep("ready");
      setNotice("照片品質已通過，可以產生完整面相文化觀察報告。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "系統錯誤");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeRun() {
    if (!runId || !chargeConsent) return setNotice("請先確認本次成功產出將扣除 20 點。");
    const token = window.localStorage.getItem(TOKEN_KEY) || "";
    if (!token) return (window.location.href = "/login?next=/member-ai/face");

    setBusy(true);
    setNotice("正在進行結構化觀察與報告整理，請勿重複送出…");
    try {
      const response = await fetch(`/api/face-analysis/runs/${runId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "報告產生失敗");
      setReportText(data.run?.report_text || "");
      track("face_report_completed", {
        charged: Number(data.creditsCharged || data.run?.credits_charged || 0)
      });
      setStep("report");
      setNotice(
        data.creditWarning ||
          `報告已完成，本次扣除 ${Number(data.creditsCharged || data.run?.credits_charged || 0)} 點。`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "系統錯誤");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOriginalImage() {
    if (!runId) return;
    const token = window.localStorage.getItem(TOKEN_KEY) || "";
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch("/api/face-analysis/runs/" + runId + "/image", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "照片刪除失敗");
      track("face_source_image_deleted");
      setNotice("原始照片已立即刪除，報告內容仍會保留。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "照片刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader showMobileDock={false} />
      <main className="face-page">
        {step === "landing" ? (
          <section className="face-hero" aria-labelledby="face-title">
            <div className="face-eyebrow">巽風面相 · 民俗文化參考</div>
            <h1 id="face-title">從一張清晰正面照，讀懂傳統面相的觀察語言</h1>
            <p>先進行免費拍攝品質檢查；只有品質通過並經您確認，才會進入完整報告流程。</p>
            <div className="face-benefits">
              <article><strong>先檢查、不扣點</strong><span>清晰度、光線、角度與單一人臉會先經過檢查。</span></article>
              <article><strong>照片私密保存</strong><span>原始照片不公開，並依保存政策自動刪除。</span></article>
              <article><strong>明確使用邊界</strong><span>不進行醫療、法律、投資建議或敏感屬性推論。</span></article>
            </div>
            <div className="face-photo-guide" aria-label="照片拍攝示意">
              <div className="good"><i aria-hidden>◯</i><strong>適合</strong><span>正面、單人、光線均勻、五官清楚</span></div>
              <div className="bad"><i aria-hidden>╱</i><strong>請避免</strong><span>側臉、口罩、逆光、模糊或多人合照</span></div>
            </div>
            <div className="face-price-note"><strong>品質檢查免費</strong><span>完整報告 20 點</span><span>原始照片最長 24 小時內刪除</span></div>
            <div className="face-landing-actions">
              <button className="face-primary" onClick={() => setStep("capture")} data-xf-event="face_start_quality_check">開始免費品質檢查</button>
              <a className="face-secondary" href="/member-ai/face/history">我的面相報告</a>
            </div>
            <p className="face-fineprint">本功能屬傳統民俗文化與自我觀察參考，不代表對個性、命運或未來的事實認定。</p>
          </section>
        ) : step === "capture" ? (
          <section className="face-workspace" aria-labelledby="capture-title">
            <button className="face-back" onClick={goToLanding}>← 返回介紹</button>
            <div className="face-panel">
              <div>
                <div className="face-eyebrow">步驟 1 · 拍攝準備</div>
                <h1 id="capture-title">準備正面照片</h1>
                <p>請正面看鏡頭、保持光線均勻，並確保畫面中只有一人。</p>
              </div>

              <fieldset className="face-fieldset">
                <legend>照片對象</legend>
                <div className="face-mode-grid">
                  <label className={mode === "self" ? "selected" : ""}><input type="radio" name="mode" checked={mode === "self"} onChange={() => setMode("self")} />分析自己</label>
                  <label className={mode === "other" ? "selected" : ""}><input type="radio" name="mode" checked={mode === "other"} onChange={() => setMode("other")} />分析他人</label>
                </div>
              </fieldset>

              <label className="face-field">
                <span>年齡（選填）</span>
                <input type="number" min="1" max="120" inputMode="numeric" value={subjectAge} onChange={(event) => setSubjectAge(event.target.value)} placeholder="例如：35" />
              </label>

              <div className="face-preview">
                {cameraOpen ? <video ref={videoRef} autoPlay playsInline muted aria-label="相機即時預覽" /> : previewUrl ? <img src={previewUrl} alt="已選擇的面相分析照片預覽" /> : <div><span>正面、臉部清晰</span><small>請避免口罩、逆光、側臉與多人合照</small></div>}
              </div>
              {selectedFile && <div className="face-file-meta"><span>{selectedFile.name}</span><span>{formatBytes(selectedFile.size)}</span><span>{selectedFile.type.replace("image/", "").toUpperCase()}</span><span>上傳後會移除影像附加資訊</span></div>}

              <div className="face-actions">
                {cameraOpen ? <><button className="face-primary" onClick={captureFrame}>拍下照片</button><button className="face-secondary" onClick={stopCamera}>關閉相機</button></> : <><button className="face-secondary" onClick={openCamera}>開啟即時相機</button><label className="face-upload">拍照或選擇照片<input type="file" accept="image/jpeg,image/png,image/webp" capture={mode === "self" ? "user" : "environment"} onChange={handleFile} /></label></>}
              </div>

              <div className="face-consents">
                <label><input type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} /><span>我已閱讀並同意為品質檢測處理此照片，並了解照片會依保存政策刪除。</span></label>
                {mode === "other" && <label><input type="checkbox" checked={thirdPartyConsent} onChange={(event) => setThirdPartyConsent(event.target.checked)} /><span>我確認已取得照片本人的明確同意。</span></label>}
              </div>

              {notice && <p className="face-notice" role="status">{notice}</p>}
              <button className="face-primary face-submit" onClick={createAnalysisRun} disabled={busy} data-xf-event="face_submit_quality_check">{busy ? "正在建立安全任務…" : "進行照片品質檢查"}</button>
              <p className="face-fineprint">此階段不扣點。品質檢測通過後，系統會另行告知完整報告所需點數。</p>
            </div>
          </section>
        ) : step === "ready" ? (
          <section className="face-workspace" aria-labelledby="ready-title">
            <button className="face-back" onClick={() => setStep("capture")}>← 重新選擇照片</button>
            <div className="face-panel face-ready">
              <div className="face-eyebrow">步驟 2 · 品質通過</div>
              <h1 id="ready-title">照片已可進行分析</h1>
              <p>系統已確認單一正面人臉、基本清晰度、光線與角度符合門檻。</p>
              {quality && (
                <dl className="face-quality-grid">
                  <div><dt>人臉數量</dt><dd>{quality.faceCount}</dd></div>
                  <div><dt>清晰度</dt><dd>{quality.sharpness === "good" ? "良好" : "可用"}</dd></div>
                  <div><dt>光線</dt><dd>{quality.lighting === "acceptable" ? "可用" : "需注意"}</dd></div>
                  <div><dt>角度</dt><dd>{quality.pose === "front" ? "正面" : "需重拍"}</dd></div>
                </dl>
              )}
              <div className="face-consents">
                <label>
                  <input type="checkbox" checked={chargeConsent} onChange={(event) => setChargeConsent(event.target.checked)} />
                  <span>我了解只有成功產出完整報告才會扣除 20 點；失敗或品質不合格不扣點。</span>
                </label>
              </div>
              {notice && <p className="face-notice" role="status">{notice}</p>}
              <button className="face-primary face-submit" onClick={analyzeRun} disabled={busy || !chargeConsent} data-xf-event="face_generate_report">
                {busy ? "分析與報告整理中…" : "確認產生完整報告（20 點）"}
              </button>
              <p className="face-fineprint">本報告為民俗文化與自我觀察參考，不作醫療、心理、法律或投資判斷。</p>
            </div>
          </section>
        ) : (
          <section className="face-workspace" aria-labelledby="report-title">
            <div className="face-panel face-report">
              <div className="face-eyebrow">面相文化觀察報告</div>
              <h1 id="report-title">巽風面相報告</h1>
              {notice && <p className="face-notice" role="status">{notice}</p>}
              <article className="face-report-content"><pre>{reportText}</pre></article>
              <div className="face-report-actions">
                <button className="face-primary" onClick={() => window.print()}>列印／儲存 PDF</button>
                <a className="face-secondary" href="/member-ai/face/history">查看我的報告</a>
                <button className="face-secondary" onClick={deleteOriginalImage} disabled={busy}>立即刪除原始照片</button>
                <button className="face-secondary" onClick={() => window.location.reload()}>開始新的分析</button>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

const QUALITY_REASON_TEXT: Record<string, string> = {
  NO_FACE: "沒有偵測到清楚人臉",
  MULTIPLE_FACES: "照片中有多張人臉",
  FACE_TOO_SMALL: "臉部在畫面中太小",
  TOO_BLURRY: "照片過於模糊",
  TOO_DARK: "照片光線太暗",
  TOO_BRIGHT: "照片過度曝光",
  POSE_NOT_FRONT: "臉部角度不是正面",
  FACE_OCCLUDED: "眼睛、鼻子或嘴部受到遮擋"
};

function qualityMessage(reasons: string[]) {
  const messages = reasons.map((reason) => QUALITY_REASON_TEXT[reason] || "照片未通過品質門檻");
  return `請重新拍攝：${messages.join("、")}。`;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? Math.ceil(bytes / 1024) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}
