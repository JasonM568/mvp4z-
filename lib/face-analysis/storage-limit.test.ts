// 面相報告保存額度。
//
// 這條規則會「擋住付費會員使用他買的點數」，所以計數條件必須精準：
// 多算一種狀態，會員就會在還沒存滿 30 份時被鎖住，而且他從畫面上看不出原因。
//
// 特別要防的是漏掉 status 過濾——那會把 failed、expired、已刪除的紀錄一起算進去。

import { describe, expect, it, vi } from "vitest";
import { countStoredFaceReports } from "./runs";
import { FACE_REPORT_STORAGE_LIMIT } from "./config";

type Recorded = {
  table?: string;
  select?: [string, unknown];
  eq: Array<[string, unknown]>;
};

/** 記錄 PostgREST 呼叫鏈，讓測試能斷言「查了什麼」而不只是「回了什麼」。 */
function fakeAdmin(count: number | null, error: unknown = null) {
  const recorded: Recorded = { eq: [] };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((columns: string, options: unknown) => {
    recorded.select = [columns, options];
    return builder;
  });
  builder.eq = vi.fn((column: string, value: unknown) => {
    recorded.eq.push([column, value]);
    return builder;
  });
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ count, error });

  const admin = {
    from: vi.fn((table: string) => {
      recorded.table = table;
      return builder;
    })
  };
  return { admin: admin as never, recorded };
}

describe("面相報告保存額度", () => {
  it("上限是 30 份", () => {
    expect(FACE_REPORT_STORAGE_LIMIT).toBe(30);
  });

  it("只計 completed，且只計該會員自己的", async () => {
    const { admin, recorded } = fakeAdmin(7);
    const used = await countStoredFaceReports(admin, "user-1");

    expect(used).toBe(7);
    expect(recorded.table).toBe("face_analysis_runs");
    // 兩個條件缺一不可：漏 status 會把失敗與已刪的算進去，
    // 漏 user_id 會把全站的報告算成同一個人的。
    expect(recorded.eq).toContainEqual(["status", "completed"]);
    expect(recorded.eq).toContainEqual(["user_id", "user-1"]);
    expect(recorded.eq).toHaveLength(2);
  });

  it("用 head + count，不把資料撈回來", async () => {
    // 這個數字每次列表與每次建立任務都會問一遍，撈資料等於白付流量。
    const { admin, recorded } = fakeAdmin(0);
    await countStoredFaceReports(admin, "user-1");
    expect(recorded.select?.[1]).toEqual({ count: "exact", head: true });
  });

  it("沒有任何報告時回 0，不是 null", async () => {
    const { admin } = fakeAdmin(null);
    await expect(countStoredFaceReports(admin, "user-1")).resolves.toBe(0);
  });

  it("查詢失敗時往上拋，不吞成 0", async () => {
    // 吞成 0 會讓額度檢查在資料庫出問題時全面放行，
    // 比直接讓這次請求失敗更糟——那是靜默失效。
    const { admin } = fakeAdmin(null, { message: "boom" });
    await expect(countStoredFaceReports(admin, "user-1")).rejects.toBeTruthy();
  });
});
