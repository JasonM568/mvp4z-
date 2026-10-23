// 流年用的年齡：虛歲。
//
// 九值（九執）與七十五部位流年法都以虛歲對照部位：出生當年算 1 歲，之後每過一個年頭加 1。
// 這裡用「今年（台北時間）− 出生年 + 1」。傳統虛歲以農曆新年換歲，
// 本系統只收出生年、不收出生月日，所以以西曆年頭為界，與老師的流年表以「年」為單位的用法一致。

export function taipeiYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric" }).format(now);
  return Number(year);
}

/** 虛歲。出生年不合理（未來、早於 1900、超過 120 歲）回 null。 */
export function nominalAge(birthYear: number | null | undefined, now: Date = new Date()): number | null {
  if (birthYear == null || !Number.isInteger(birthYear)) return null;
  const age = taipeiYear(now) - birthYear + 1;
  return age >= 1 && age <= 120 ? age : null;
}
