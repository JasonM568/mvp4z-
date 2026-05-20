import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const registerSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email("Email 格式錯誤").transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40).optional().default(""),
  password: z.string().min(8, "密碼至少需要 8 碼")
});

export const loginSchema = z.object({
  email: z.string().trim().email("Email 格式錯誤").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "請輸入密碼")
});

export const redeemSchema = z.object({
  code: z.string().trim().min(1, "請輸入啟用碼").transform((value) => value.toUpperCase())
});

import { resolveTierFeatures, TierFeatures, TierResolution } from "@/lib/auth/tier";

export type PublicMember = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  plan: string;
  status: "pending" | "active" | "expired";
  credits_remaining: number;
  expires_at: string | null;
  tier: TierResolution;
  tier_features: TierFeatures;
  entitlement_id: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
};

type Entitlement = {
  id: string;
  status: string;
  credits_remaining: number;
  expires_at: string;
  tier_features?: TierFeatures | null;
  plans: { code: string; name: string } | null;
};

export function createSupabasePasswordClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export async function readJson<T>(request: NextRequest, schema: z.ZodSchema<T>) {
  const body = await request.json().catch(() => ({}));
  return schema.parse(body);
}

export async function requireBearerProfile(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) throw statusError("尚未登入", 401);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw statusError("登入已過期，請重新登入", 401);

  const profile = await ensureProfileForAuthUser({
    authUserId: data.user.id,
    email: data.user.email || "",
    name: getMetadataString(data.user.user_metadata?.name),
    phone: getMetadataString(data.user.user_metadata?.phone)
  });

  return { token, authUser: data.user, profile };
}

function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function ensureProfileForAuthUser(input: {
  authUserId: string;
  email: string;
  name?: string;
  phone?: string;
}) {
  if (!input.email) throw statusError("會員 Email 不存在", 400);

  const admin = createSupabaseAdminClient();
  const desiredRole = isAdminEmail(input.email) ? "admin" : null;

  const { data: existing, error: selectError } = await admin
    .from("profiles")
    .select("id, auth_user_id, name, email, phone, role, created_at")
    .eq("auth_user_id", input.authUserId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    // 若 email 在 ADMIN_EMAILS 但目前 role 還是 member，自動升 admin（單向不會降回 member）
    if (desiredRole === "admin" && existing.role !== "admin") {
      const { data: upgraded, error: upgradeErr } = await admin
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", existing.id)
        .select("id, auth_user_id, name, email, phone, role, created_at")
        .single();
      if (upgradeErr) throw upgradeErr;
      return upgraded as Profile;
    }
    return existing as Profile;
  }

  const newProfile: Record<string, unknown> = {
    auth_user_id: input.authUserId,
    email: input.email.toLowerCase(),
    name: input.name || "",
    phone: input.phone || ""
  };
  if (desiredRole) newProfile.role = desiredRole;

  const { data, error } = await admin
    .from("profiles")
    .upsert(newProfile, { onConflict: "email" })
    .select("id, auth_user_id, name, email, phone, role, created_at")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function getPublicMember(profileId: string) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, auth_user_id, name, email, phone, role, created_at")
    .eq("id", profileId)
    .single();

  if (profileError) throw profileError;

  const { data: entitlement, error: entitlementError } = await admin
    .from("member_entitlements")
    .select("id, status, credits_remaining, expires_at, tier_features, plans(code, name)")
    .eq("user_id", profileId)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entitlementError) throw entitlementError;
  return toPublicMember(profile as Profile, entitlement as Entitlement | null);
}

export function toPublicMember(profile: Profile, entitlement?: Entitlement | null): PublicMember {
  const today = new Date().toISOString();
  const active =
    entitlement?.status === "active" &&
    Number(entitlement.credits_remaining || 0) > 0 &&
    entitlement.expires_at >= today;

  const planCode = entitlement?.plans?.code || "free";
  const tierFeatures = (entitlement?.tier_features || {}) as TierFeatures;
  const tier = resolveTierFeatures({ planCode, tierFeatures });

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role || "member",
    plan: planCode,
    status: active ? "active" : entitlement ? "expired" : "pending",
    credits_remaining: entitlement?.credits_remaining || 0,
    expires_at: entitlement?.expires_at || null,
    tier,
    tier_features: tierFeatures,
    entitlement_id: entitlement?.id || null,
    created_at: profile.created_at
  };
}

export function authResponse(session: { access_token: string; refresh_token?: string }, member: PublicMember) {
  return {
    ok: true,
    token: session.access_token,
    refresh_token: session.refresh_token,
    member
  };
}

export function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export function errorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (status >= 400 && status <= 599) return status;
  }
  if (error instanceof z.ZodError) return 400;
  return 500;
}

export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "欄位格式錯誤";
  if (error instanceof Error) return error.message;
  return String(error || "系統錯誤");
}

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function getMetadataString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}
