import Script from "next/script";

type LegacyPageProps = {
  html: string;
  scripts?: string[];
};

export function LegacyPage({ html, scripts = [] }: LegacyPageProps) {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
    </>
  );
}
