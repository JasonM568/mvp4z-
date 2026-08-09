import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "四象問天機｜命、局、卦、象，四術合參",
  description: "以八字、奇門、六爻與梅花易數四術合參，為一件具體事情生成《巽風四象天機書》。"
};

export default function DecisionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
