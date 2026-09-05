"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  name: string | null;
  email: string;
  plan: string;
  status: string;
  credits_remaining: number;
  expires_at: string | null;
  tier?: { councilCost?: number };
};

type CouncilRun = {
  id: string;
  request?: { question?: string; topic?: string } | null;
  final_label?: string | null;
  final_text?: string | null;
  final_ok: boolean;
  fallback_used: boolean;
  credits_charged: number;
  generated_at?: string | null;
  created_at: string;
};

type MemberOrder = {
  order_no: string;
  amount: number;
  status: string;
  order_type: string;
  item_name: string;
  created_at: string;
  activated: boolean;
};

type FaceRun = {
  id: string;
  status: string;
  report_structured?: { summary?: string } | null;
  report_text?: string | null;
  credits_charged: number;
  completed_at?: string | null;
  created_at: string;
};

export default function MemberPage() {
  const [member, setMember] = useState<Member | null>(null);
  const [council, setCouncil] = useState<CouncilRun[]>([]);
  const [faces, setFaces] = useState<FaceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [pendingCouncil, setPendingCouncil] = useState(false);
  const [payment, setPayment] = useState<{ state: "checking" | "activated" | "waiting" | "failed"; orderNo: string; message: string } | null>(null);
  const [openOrders, setOpenOrders] = useState<MemberOrder[]>([]);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) {
      window.location.href = "/login?next=/member";
      return;
    }
    try {
      const headers = { Authorization: "Bearer " + token };
      const [memberResponse, councilResponse, faceResponse] = await Promise.all([
        fetch("/api/member/me", { headers }),
        fetch("/api/member/council-runs?limit=6", { headers }),
        fetch("/api/face-analysis/runs?limit=6", { headers })
      ]);
      const memberData = await memberResponse.json().catch(() => ({}));
      if (!memberResponse.ok) throw new Error(memberData.error || "登入狀態已失效");
      setMember(memberData.member);
      const councilData = await councilResponse.json().catch(() => ({}));
      const faceData = await faceResponse.json().catch(() => ({}));
      if (councilResponse.ok) setCouncil(Array.isArray(councilData.items) ? councilData.items : []);
      if (faceResponse.ok) setFaces(Array.isArray(faceData.items) ? faceData.items : []);

      // 未完成的訂單要看得見。使用者把綠界頁面關掉之後，站內原本完全找不到那張單。
      const orderResponse = await fetch("/api/member/orders", { headers });
      const orderData = await orderResponse.json().catch(() => ({}));
      if (orderResponse.ok && Array.isArray(orderData.items)) {
        setOpenOrders(
          (orderData.items as MemberOrder[]).filter(
            (o) => o.status === "pending" || (o.status === "paid" && !o.activated)
          )
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法載入會員資料");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * 綠界付款後導回 /member?payment=paid|pending&order=XF...。
   * 這兩個參數原本完全沒人讀，使用者付完款回來看不到任何結果，還可能看到舊點數
   * —— 因為綠界的瀏覽器導回常常比 server 端的 notify 先到。
   * 這裡輪詢訂單狀態，直到開通完成或逾時。
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("payment");
    const orderNo = (params.get("order") || "").trim();
    if (!result) return;

    // 讀完就把參數從網址拿掉，重整不會再跳一次付款結果。
    window.history.replaceState({}, "", window.location.pathname);

    if (result !== "paid" && result !== "pending") {
      setPayment({ state: "failed", orderNo, message: "付款未完成或已取消，您可以回方案頁重新購買。" });
      return;
    }
    if (!orderNo) {
      setPayment({ state: "waiting", orderNo, message: "已收到付款結果，正在更新您的方案。" });
      return;
    }

    let cancelled = false;
    setPayment({ state: "checking", orderNo, message: "付款完成，正在為您開通方案…" });

    (async () => {
      const token = window.localStorage.getItem("xunfeng_member_token") || "";
      if (!token) return;
      // 最多等約 20 秒（10 次 × 2 秒）。綠界 notify 通常幾秒內就到。
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/api/member/orders?order_no=${encodeURIComponent(orderNo)}`, {
            headers: { Authorization: "Bearer " + token }
          });
          const data = await response.json().catch(() => ({}));
          const order = (Array.isArray(data.items) ? data.items : [])[0] as MemberOrder | undefined;
          if (order?.activated) {
            if (cancelled) return;
            setPayment({ state: "activated", orderNo, message: "付款完成，方案已開通。" });
            void load();
            return;
          }
          if (order && order.status !== "pending" && order.status !== "paid") {
            if (cancelled) return;
            setPayment({ state: "failed", orderNo, message: "這筆訂單並未完成付款，您可以回方案頁重新購買。" });
            return;
          }
        } catch {
          // 網路暫時失敗就繼續重試，不要把使用者嚇到。
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (cancelled) return;
      // 逾時不等於失敗：ATM／超商本來就要等實際繳費，信用卡也可能只是 notify 慢。
      setPayment({
        state: "waiting",
        orderNo,
        message:
          "已收到付款資訊，但尚未確認開通。若您使用 ATM 或超商代碼，請於期限內完成繳費；" +
          "信用卡付款通常幾分鐘內完成，稍後重新整理即可。若超過 30 分鐘仍未開通，請與我們聯繫。"
      });
    })();

    return () => { cancelled = true; };
  }, [load]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("xunfeng_four_aspects_pending");
      if (!raw) return;
      const pending = JSON.parse(raw);
      setPendingCouncil(Date.now() - Date.parse(pending.startedAt) < 6 * 60 * 1000);
    } catch {}
  }, []);

  function logout() {
    window.localStorage.removeItem("xunfeng_member_token");
    window.location.href = "/";
  }

  if (loading) return <main className="my-xunfeng-loading">正在開啟我的巽風…</main>;

  return (
    <main className="my-xunfeng">
      <section className="my-xunfeng-hero">
        <div className="wrap">
          <div className="tag">MY XUNFENG</div>
          <div className="my-xunfeng-head">
            <div><h1>我的巽風</h1><p>{member?.name || member?.email}，從這裡開始問事、看報告與管理點數。</p></div>
            <button type="button" onClick={logout}>登出</button>
          </div>
          {notice && <p className="status">{notice}</p>}
          {payment && (
            <div className={`my-payment-banner ${payment.state}`} role="status" aria-live="polite">
              <strong>
                {payment.state === "checking" && "正在確認付款…"}
                {payment.state === "activated" && "付款完成，方案已開通"}
                {payment.state === "waiting" && "已收到付款資訊，等待確認"}
                {payment.state === "failed" && "付款未完成"}
              </strong>
              <p>{payment.message}</p>
              {payment.orderNo && <span>訂單編號 {payment.orderNo}</span>}
              {payment.state === "failed" && <a href="/member-pricing">回方案頁</a>}
            </div>
          )}
          {openOrders.length > 0 && (
            <div className="my-open-orders">
              <strong>未完成的訂單</strong>
              <ul>
                {openOrders.map((order) => (
                  <li key={order.order_no}>
                    <span>{order.item_name}　NT${order.amount}</span>
                    <b>
                      {order.status === "pending"
                        ? "尚未完成付款"
                        : "已付款，開通處理中；若超過 30 分鐘仍未開通請與我們聯繫"}
                    </b>
                    <span>{order.order_no}</span>
                    {order.status === "pending" && <a href="/member-pricing">重新購買</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="my-xunfeng-stats">
            <div><span>目前方案</span><strong>{String(member?.plan || "free").toUpperCase()}</strong></div>
            <div><span>剩餘點數</span><strong>{member?.credits_remaining ?? 0}</strong></div>
            <div><span>會員狀態</span><strong>{statusLabel(member?.status)}</strong></div>
            <div><span>有效期限</span><strong>{member?.expires_at ? new Date(member.expires_at).toLocaleDateString("zh-TW") : "尚未啟用"}</strong></div>
          </div>
        </div>
      </section>

      <section className="my-xunfeng-section">
        <div className="wrap">
          {pendingCouncil && (
            <a className="my-continue-card" href="/member-ai/decision">
              <span>進行中</span><div><strong>四象正在合參</strong><p>可回到原流程等待，完成後會自動展開天機書。</p></div><b>繼續查看 →</b>
            </a>
          )}
          <div className="my-xunfeng-section-head"><div><span>QUICK START</span><h2>今天想從哪裡開始？</h2></div><a href="/member-pricing">方案與點數</a></div>
          <div className="my-xunfeng-actions">
            <a className="primary" href="/member-ai/decision"><i>象</i><strong>開始問天機</strong><span>命、局、卦、象，四術合參</span><b>生成天機書 →</b></a>
            <a href="/member-ai/face"><i>相</i><strong>開始面相觀察</strong><span>先做免費照片品質檢查</span><b>進入面相系統 →</b></a>
            <a href="/member-ai"><i>問</i><strong>AI 即時問答</strong><span>八字、風水與命理初步提問</span><b>開始提問 →</b></a>
          </div>
        </div>
      </section>

      <section className="my-xunfeng-section my-reports-section">
        <div className="wrap">
          <div className="my-xunfeng-section-head"><div><span>MY REPORTS</span><h2>我的報告</h2></div></div>
          <div className="my-report-columns">
            <ReportColumn
              title="巽風四象天機書"
              empty="還沒有天機書，從一件具體事情開始問。"
              action={{ href: "/member-ai/decision", label: "開始問天機" }}
              items={council.map((run) => ({
                id: run.id,
                title: run.request?.question || run.request?.topic || "四象問事",
                summary: run.final_label || run.final_text?.slice(0, 72) || (run.fallback_used ? "本次需補充資料" : "天機書已完成"),
                date: run.generated_at || run.created_at,
                meta: run.credits_charged + " 點",
                href: "/member/reports/" + run.id
              }))}
            />
            <ReportColumn
              title="面相文化觀察報告"
              empty="還沒有面相報告，品質檢查免費。"
              action={{ href: "/member-ai/face/history", label: faces.length ? "查看全部" : "開始面相觀察" }}
              items={faces.map((run) => ({
                id: run.id,
                title: run.status === "completed" ? "面相觀察完成" : "本次分析未完成",
                summary: run.report_structured?.summary || run.report_text?.slice(0, 72) || "報告資料",
                date: run.completed_at || run.created_at,
                meta: run.credits_charged + " 點",
                href: "/member-ai/face/history"
              }))}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ReportColumn({
  title,
  empty,
  action,
  items
}: {
  title: string;
  empty: string;
  action: { href: string; label: string };
  items: { id: string; title: string; summary: string; date: string; meta: string; href?: string }[];
}) {
  return (
    <article className="my-report-column">
      <header><h3>{title}</h3><a href={action.href}>{action.label}</a></header>
      {items.length === 0 ? <p className="my-report-empty">{empty}</p> : (
        <div className="my-report-list">
          {items.map((item) => (
            <a href={item.href || "#"} key={item.id} onClick={item.href ? undefined : (event) => event.preventDefault()}>
              <div><strong>{item.title}</strong><p>{item.summary}</p></div>
              <small>{new Date(item.date).toLocaleDateString("zh-TW")}・{item.meta}</small>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function statusLabel(status?: string) {
  return status === "active" ? "使用中" : status === "expired" ? "已到期" : "待啟用";
}
