// 後台｜寄件網域（Resend）狀態與驗證。
//
// 為什麼需要這支：RESEND_API_KEY 只存在正式站環境，本機讀不到，
// 所以「這個網域驗證了沒、還缺哪幾筆 DNS」這件事沒有地方查得到。
// 2026-09-23 就是這樣：key 補上了、以為好了，實際按下測試才發現 Resend 回
// 403「xunfeng.tw domain is not verified」——而在有這支之前，
// 唯一的發現方式是等某天真的出事卻沒收到信。
//
// GET    → 目前狀態與 Resend 要求的 DNS 記錄
// POST {action:"create"} → 在 Resend 建立寄件網域
// POST {action:"verify"} → 要求 Resend 重新檢查 DNS
//
// 這支只讀寫「寄件網域」這一件事，不碰任何寄信行為。

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";

export const runtime = "nodejs";

/** 寄件網域。與 admin-alerts.ts 的 RESEND_FROM_EMAIL 預設值一致。 */
const SENDING_DOMAIN = "xunfeng.tw";
const RESEND_API = "https://api.resend.com";

async function resend(path: string, init?: RequestInit) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw statusError("正式環境沒有設定 RESEND_API_KEY", 503);

  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 原樣帶出上游訊息。Resend 的錯誤講得很清楚，翻譯或簡化只會讓人查錯方向。
    throw statusError(`Resend ${res.status}：${body?.message || JSON.stringify(body).slice(0, 200)}`, 502);
  }
  return body;
}

async function findDomain() {
  const list = await resend("/domains");
  const items = Array.isArray(list?.data) ? list.data : [];
  return items.find((d: any) => d?.name === SENDING_DOMAIN) || null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const found = await findDomain();
    if (!found) {
      return apiJson({ ok: true, domain: SENDING_DOMAIN, exists: false, status: null, records: [] });
    }
    // 清單不含 records，要再查一次單筆才拿得到 DNS 需求。
    const detail = await resend(`/domains/${found.id}`);
    return apiJson({
      ok: true,
      domain: SENDING_DOMAIN,
      exists: true,
      id: found.id,
      status: detail?.status ?? found?.status ?? null,
      region: detail?.region ?? null,
      records: detail?.records ?? []
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "create") {
      const existing = await findDomain();
      if (existing) {
        const detail = await resend(`/domains/${existing.id}`);
        return apiJson({ ok: true, created: false, id: existing.id, status: detail?.status, records: detail?.records ?? [] });
      }
      // region 跟著 Vercel 的部署區域（iad1 = us-east-1），少一次跨區往返。
      const created = await resend("/domains", {
        method: "POST",
        body: JSON.stringify({ name: SENDING_DOMAIN, region: "us-east-1" })
      });
      return apiJson({ ok: true, created: true, id: created?.id, status: created?.status, records: created?.records ?? [] });
    }

    if (action === "verify") {
      const found = await findDomain();
      if (!found) throw statusError(`Resend 上還沒有 ${SENDING_DOMAIN}，請先建立`, 404);
      await resend(`/domains/${found.id}/verify`, { method: "POST" });
      // verify 是非同步的：這裡回的是「已要求檢查」，不是「已通過」。
      // 立刻再讀一次目前狀態，讓呼叫端看到的是實況而不是一句樂觀的 ok。
      const detail = await resend(`/domains/${found.id}`);
      return apiJson({ ok: true, requested: true, status: detail?.status, records: detail?.records ?? [] });
    }

    throw statusError("action 必須是 create 或 verify", 400);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
