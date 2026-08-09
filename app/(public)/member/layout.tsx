import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的巽風｜會員工作台",
  description: "管理巽風會員方案、點數、四象天機書與面相文化觀察報告。"
};

export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
