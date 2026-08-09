import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "巽風面相系統｜民俗文化觀察",
  description: "先免費檢查正面照片品質，通過並確認後產出巽風面相文化觀察報告。"
};

export default function FaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
