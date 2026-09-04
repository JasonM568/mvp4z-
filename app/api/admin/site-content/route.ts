import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CONTENT_FIELDS,
  CONTENT_TABLES,
  PROMO_FIELDS,
  sanitizePromoList,
  PROMO_ID,
  PROMO_TABLE,
  readAllContent,
  toPromoPayload,
  type SiteContentType
} from "@/lib/site/content";

const TYPE_LABELS: Record<SiteContentType, string> = {
  services: "老師服務",
  cases: "案例實績",
  courses: "課程講座"
};

const SETUP_HINT =
  "資料表尚未建立，請先執行 supabase/migrations/20260901154318_site_content_cms.sql。";

function parseType(request: NextRequest): SiteContentType {
  const value = new URL(request.url).searchParams.get("type") || "";
  if (value in CONTENT_TABLES) return value as SiteContentType;
  throw statusError("type 必須是 services / cases / courses", 400);
}

function typeOf(value: unknown): SiteContentType {
  const key = String(value || "");
  if (key in CONTENT_TABLES) return key as SiteContentType;
  throw statusError("type 必須是 services / cases / courses", 400);
}

function isMissingTable(error: unknown) {
  return Boolean(error && typeof error === "object" && String((error as { code?: string }).code) === "42P01");
}

/** 只取白名單欄位，一律轉字串並去頭尾空白；title 必填。 */
function pickFields(type: SiteContentType, body: Record<string, unknown>, requireTitle: boolean) {
  const patch: Record<string, unknown> = {};
  for (const field of CONTENT_FIELDS[type]) {
    if (body[field] === undefined) continue;
    patch[field] = String(body[field] ?? "").trim();
  }
  if (requireTitle && !String(patch.title || "").trim()) throw statusError("請填寫標題", 400);
  if (patch.title !== undefined && !String(patch.title).trim()) throw statusError("標題不可留空", 400);
  return patch;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);

    if (url.searchParams.get("type") === "promo") {
      const { data, error } = await createSupabaseAdminClient()
        .from(PROMO_TABLE)
        .select("*")
        .eq("id", PROMO_ID)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return apiJson({ ok: true, promo: null, setup_required: SETUP_HINT });
        throw error;
      }
      return apiJson({ ok: true, promo: toPromoPayload(data as Record<string, unknown> | null), raw: data });
    }

    const type = parseType(request);
    try {
      return apiJson({ ok: true, type, items: await readAllContent(type) });
    } catch (error) {
      if (isMissingTable(error)) return apiJson({ ok: true, type, items: [], setup_required: SETUP_HINT });
      throw error;
    }
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = typeOf(body.type);
    const admin = createSupabaseAdminClient();

    // 新項目一律排到最後，避免插隊蓋掉既有排序。
    const { data: last } = await admin
      .from(CONTENT_TABLES[type])
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const insert = {
      ...pickFields(type, body, true),
      is_published: body.is_published === undefined ? false : Boolean(body.is_published),
      sort_order: Number(last?.sort_order || 0) + 10
    };

    const { data, error } = await admin.from(CONTENT_TABLES[type]).insert(insert).select("*").single();
    if (error) {
      if (isMissingTable(error)) throw statusError(SETUP_HINT, 503);
      throw error;
    }

    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: "site_content.create",
      targetType: CONTENT_TABLES[type],
      targetId: data.id,
      metadata: { title: data.title, label: TYPE_LABELS[type] }
    });
    return apiJson({ ok: true, item: data }, 201);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (String(body.type || "") === "promo") return patchPromo(body, auth.profile?.id);

    const type = typeOf(body.type);
    const id = String(body.id || "");
    if (!id) throw statusError("缺少項目 id", 400);
    const admin = createSupabaseAdminClient();

    // 上下移動：跟相鄰的項目對調 sort_order。
    if (body.move === "up" || body.move === "down") {
      return moveItem(type, id, body.move, auth.profile?.id);
    }

    const patch = pickFields(type, body, false);
    if (body.is_published !== undefined) patch.is_published = Boolean(body.is_published);
    if (Object.keys(patch).length === 0) throw statusError("沒有要更新的欄位", 400);

    const { data, error } = await admin
      .from(CONTENT_TABLES[type])
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) throw statusError(SETUP_HINT, 503);
      throw error;
    }
    if (!data) throw statusError("找不到這個項目", 404);

    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: body.is_published === undefined ? "site_content.update" : "site_content.publish",
      targetType: CONTENT_TABLES[type],
      targetId: id,
      metadata: { title: data.title, is_published: data.is_published }
    });
    return apiJson({ ok: true, item: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const url = new URL(request.url);
    const type = parseType(request);
    const id = url.searchParams.get("id") || "";
    if (!id) throw statusError("缺少項目 id", 400);

    const { data, error } = await createSupabaseAdminClient()
      .from(CONTENT_TABLES[type])
      .delete()
      .eq("id", id)
      .select("id, title")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到這個項目", 404);

    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: "site_content.delete",
      targetType: CONTENT_TABLES[type],
      targetId: id,
      metadata: { title: data.title }
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

async function moveItem(type: SiteContentType, id: string, direction: "up" | "down", adminId?: string) {
  const admin = createSupabaseAdminClient();
  const rows = await readAllContent(type);
  const index = rows.findIndex((row) => String(row.id) === id);
  if (index < 0) throw statusError("找不到這個項目", 404);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= rows.length) return apiJson({ ok: true, unchanged: true });

  const current = { id: String(rows[index].id), sort_order: Number(rows[index].sort_order || 0) };
  const neighbour = { id: String(rows[swapWith].id), sort_order: Number(rows[swapWith].sort_order || 0) };

  // 兩筆 sort_order 可能相同（例如都還是預設 0），那就用索引重新給值，避免對調後順序沒變。
  const currentOrder = current.sort_order === neighbour.sort_order ? (swapWith + 1) * 10 : neighbour.sort_order;
  const neighbourOrder = current.sort_order === neighbour.sort_order ? (index + 1) * 10 : current.sort_order;

  const table = CONTENT_TABLES[type];
  const first = await admin.from(table).update({ sort_order: currentOrder }).eq("id", current.id);
  if (first.error) throw first.error;
  const second = await admin.from(table).update({ sort_order: neighbourOrder }).eq("id", neighbour.id);
  if (second.error) throw second.error;

  await writeAdminAudit({
    adminUserId: adminId,
    action: "site_content.reorder",
    targetType: table,
    targetId: id,
    metadata: { direction }
  });
  return apiJson({ ok: true, items: await readAllContent(type) });
}

async function patchPromo(body: Record<string, unknown>, adminId?: string) {
  const patch: Record<string, unknown> = {};
  for (const field of PROMO_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "active") {
      patch.active = Boolean(body.active);
    } else if (field === "publish_start" || field === "publish_end") {
      const value = String(body[field] ?? "").trim();
      patch[field] = value || null;
    } else if (field === "curriculum" || field === "faqs" || field === "testimonials" || field === "gallery") {
      patch[field] = sanitizePromoList(field, body[field]);
    } else {
      patch[field] = String(body[field] ?? "").trim();
    }
  }
  if (Object.keys(patch).length === 0) throw statusError("沒有要更新的欄位", 400);

  const admin = createSupabaseAdminClient();
  // upsert：資料表剛建好、還沒有 default 那一列時也要能存。
  const { data, error } = await admin
    .from(PROMO_TABLE)
    .upsert({ id: PROMO_ID, ...patch }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    if (isMissingTable(error)) throw statusError(SETUP_HINT, 503);
    throw error;
  }

  await writeAdminAudit({
    adminUserId: adminId,
    action: "site_content.promo_update",
    targetType: PROMO_TABLE,
    targetId: PROMO_ID,
    metadata: { active: data.active, title: data.title }
  });
  return apiJson({ ok: true, promo: toPromoPayload(data as Record<string, unknown>), raw: data });
}
