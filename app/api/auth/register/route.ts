import { NextRequest, after } from "next/server";
import { apiJson } from "../../_helpers";
import {
  authResponse,
  createSupabasePasswordClient,
  ensureProfileForAuthUser,
  errorMessage,
  errorStatus,
  getPublicMember,
  grantTrialIfEligible,
  readJson,
  registerSchema,
  TRIAL_CREDITS,
  statusError,
  TRIAL_DURATION_DAYS
} from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationEmail } from "@/lib/notifications/member-emails";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { readReferralCode, REFERRAL_CODE_PATTERN } from "@/lib/referral/attribution";

function normalizeReferralCode(value: string) {
  const code = String(value || "").trim();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, registerSchema);
    const admin = createSupabaseAdminClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        phone: input.phone
      }
    });

    // Supabase 回的是英文原文（A user with this email address has already been registered），
    // 對正在買方案的訪客來說看不懂也不知道下一步，這裡換成中文並指路去登入。
    if (createError) {
      if (/already been registered|already registered|User already exists/i.test(createError.message || "")) {
        throw statusError("這個 Email 已經註冊過了，請直接用它登入；忘記密碼可以用登入面板的「忘記密碼」重設。", 409);
      }
      throw createError;
    }
    if (!created.user?.id || !created.user.email) throw new Error("建立會員失敗");

    const profile = await ensureProfileForAuthUser({
      authUserId: created.user.id,
      email: created.user.email,
      name: input.name,
      phone: input.phone
    });

    // 業務推廣來源：記在 profile 上。這一筆就是「終身歸戶」的依據 ——
    // 之後這位會員的訂單一律算在這位推廣人身上，不再依賴 cookie 還在不在。
    // 以 cookie 為主，cookie 被擋掉時用註冊頁從網址帶上來的 referral_code。
    // 失敗不阻斷註冊。
    const referralCode = readReferralCode(request) || normalizeReferralCode(input.referral_code || "");
    if (referralCode) {
      const { error: referralError } = await admin
        .from("profiles")
        .update({ referral_code: referralCode })
        .eq("id", profile.id);
      if (referralError) {
        console.warn("[register] stamp referral code failed", { profileId: profile.id, referralError });
      }
    }

    // 免費體驗：發 30 點 / 30 天 trial entitlement。失敗不阻斷註冊（使用者仍可改買方案）。
    // 同一支手機只發一次：擋掉「trial 到期就換 email 重註冊」的重複領點。
    // 注意這裡不擋註冊、只是不發點，避免誤傷想直接購買方案或家人共用門號的人。
    let trialGranted = false;
    let trialSkipReason = "grant_error";
    try {
      const trial = await grantTrialIfEligible(profile.id, input.phone);
      trialGranted = trial.granted;
      if (!trial.granted) trialSkipReason = trial.reason;
    } catch (grantError) {
      console.warn("[register] grant trial entitlement failed", { profileId: profile.id, grantError });
    }
    const trialBlockedByPhone = !trialGranted && trialSkipReason === "phone_already_claimed";

    const passwordClient = createSupabasePasswordClient();
    const { data: sessionData, error: signInError } = await passwordClient.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

    if (signInError) throw signInError;
    if (!sessionData.session) throw new Error("登入 session 建立失敗");

    // 註冊後通知信：用 after() 在回應送出後才寄，避免拖慢註冊延遲。
    // 失敗只記 log、不影響註冊。需 production 設 RESEND_API_KEY，否則 helper 直接回 skipped。
    // 兩封各自獨立寄送：給新會員的歡迎信、給管理員（ADMIN_ALERT_EMAILS）的新會員通知。
    after(async () => {
      // 沒發到點就不要在歡迎信裡講「已為您預存 30 點」——helper 收到 undefined 會整段略過。
      await sendRegistrationEmail({
        email: created.user!.email!,
        name: input.name,
        trialCredits: trialGranted ? TRIAL_CREDITS : undefined,
        trialDays: trialGranted ? TRIAL_DURATION_DAYS : undefined
      });

      await sendAdminAlert({
        subject: `[巽風] 新會員註冊：${input.name || created.user!.email!}`,
        text: [
          "後台有新的會員註冊。",
          "",
          `姓名：${input.name || ""}`,
          `Email：${created.user!.email!}`,
          `電話：${input.phone || ""}`,
          `註冊時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
          trialGranted
            ? `免費體驗：${TRIAL_CREDITS} 點 / ${TRIAL_DURATION_DAYS} 天`
            : trialBlockedByPhone
              ? `免費體驗：未發放（手機 ${input.phone} 已領過，疑似換 Email 重複註冊，請留意）`
              : `免費體驗：未發放（原因：${trialSkipReason}）`
        ].join("\n")
      });
    });

    const member = await getPublicMember(profile.id);
    return apiJson(
      authResponse(sessionData.session, member, {
        trial_granted: trialGranted,
        notice: trialGranted
          ? `註冊成功，已贈送 ${TRIAL_CREDITS} 點免費體驗（效期 ${TRIAL_DURATION_DAYS} 天）。`
          : trialBlockedByPhone
            ? "註冊成功。此手機號碼先前已使用過免費體驗，本次不再贈送點數，您可以選購方案繼續使用。"
            : "註冊成功。"
      })
    );
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
