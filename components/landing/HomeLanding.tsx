import Link from "next/link";
import { groupServicesByCategory, readServices, type ServiceItem } from "@/lib/site/services";

const tiers = [
  { code: "trial", name: "免費體驗", price: "NT$0", note: "7 天 / 3 次", credits: "3 點", features: ["AI 即時問答 3 次", "不含易學決策報告"], cta: "註冊體驗", href: "/register", highlight: false },
  { code: "basic", name: "基礎會員", price: "NT$980", note: "每月", credits: "60 點", features: ["AI 即時問答", "易學決策報告：10 點/份", "下載 .md 報告"], cta: "選此方案", href: "/member-pricing", highlight: false },
  { code: "pro", name: "進階會員", price: "NT$1,980", note: "每月", credits: "150 點", features: ["AI 即時問答", "易學決策報告：10 點/份", "下載 .md / JSON", "策略校核層"], cta: "選此方案", href: "/member-pricing", highlight: false },
  { code: "vip", name: "VIP 會員", price: "NT$4,980", note: "每月", credits: "300 點", features: ["AI 即時問答", "易學決策報告：每月 3 份免費", "超過後每份 5 點", "全部交付格式", "優先客服"], cta: "升級 VIP", href: "/member-pricing", highlight: true }
];

const products = [
  {
    title: "AI 即時問答",
    badge: "Chat",
    desc: "風水、命理、堪輿、場域管理的即時諮詢。融合乾坤國寶、龍門八局、形家風水體系，以風羿老師專業語氣回應。",
    bullets: ["1 點 / 次", "回應約 5 秒", "支援會員身份識別"],
    cta: { label: "進入 AI 問答", href: "/member-ai" }
  },
  {
    title: "易學決策報告",
    badge: "Council",
    desc: "四術同步：八字、奇門遁甲、卜卦／六爻、梅花易數。經巽風多維校核系統內部攻防，輸出可交付的十段商業顧問報告。",
    bullets: ["10 點 / 份（VIP 月免 3 份）", "120 秒內生成", "含 3/7/30 日行動方案"],
    cta: { label: "前往決策工作台", href: "/member-ai/decision" }
  }
];

export async function HomeLanding() {
  const services = await readServices();
  const grouped = groupServicesByCategory(services);

  return (
    <main style={page}>
      <header style={topbar}>
        <div style={topbarInner}>
          <Link href="/" style={brand}>
            <div style={brandMark}>巽</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>巽風堪輿</div>
              <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 2 }}>XUNFENG FIELD STRATEGY</div>
            </div>
          </Link>
          <nav style={navActions}>
            <Link href="/about" style={navLink}>關於</Link>
            <Link href="#service-catalog" style={navLink}>服務類別</Link>
            <Link href="/cases" style={navLink}>個案</Link>
            <Link href="/member-pricing" style={navLink}>會員方案</Link>
            <Link href="/login" style={navLink}>登入</Link>
            <Link href="/member-ai/decision" style={navCta}>易學決策報告</Link>
          </nav>
        </div>
      </header>

      <section style={hero}>
        <div style={heroInner}>
          <div style={kicker}>FENGYI · DECISION CONSULTING</div>
          <h1 style={heroTitle}>
            把問事流程，<br />升級成可交付的<span style={heroAccent}>顧問報告</span>。
          </h1>
          <p style={heroLead}>
            巽風易學決策系統結合八字、奇門遁甲、卜卦／六爻、梅花易數四術同步分析，由風羿老師多重分身校核系統內部攻防，最終輸出十段結構的商業決策報告。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <Link href="/register" style={ctaPrimary}>立即註冊體驗</Link>
            <Link href="/member-pricing" style={ctaSecondary}>查看會員方案</Link>
          </div>
        </div>
      </section>

      <section id="service-catalog" style={{ ...section, paddingTop: 56 }}>
        <div style={sectionInner}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={sectionTitle}>服務類別總覽</h2>
              <p style={sectionLead}>包含實體顧問、命名、命理輕顧問、與數位 AI 顧問四大類。</p>
            </div>
            <Link href="/services" style={{ color: "#10203A", fontWeight: 900, fontSize: 14, textDecoration: "none", borderBottom: "2px solid #10203A", paddingBottom: 2 }}>
              查看全部服務 →
            </Link>
          </div>

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginTop: 32 }}>
              <div style={categoryHeader}>
                <span style={categoryDot} />
                <h3 style={categoryName}>{category}</h3>
                <span style={categoryCount}>{items.length} 項</span>
              </div>
              <div style={categoryGrid}>
                {items.map((s: ServiceItem) => (
                  <ServiceCard key={s.title} item={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={section}>
        <div style={sectionInner}>
          <h2 style={sectionTitle}>兩條核心產品線</h2>
          <p style={sectionLead}>輕量級即時問答，與重量級多維校核決策報告，覆蓋從日常諮詢到重大決策的完整光譜。</p>
          <div style={productGrid}>
            {products.map((p) => (
              <article key={p.title} style={productCard}>
                <div style={productBadge}>{p.badge}</div>
                <h3 style={productTitle}>{p.title}</h3>
                <p style={productDesc}>{p.desc}</p>
                <ul style={productBullets}>
                  {p.bullets.map((b) => (
                    <li key={b} style={{ marginBottom: 6 }}>{b}</li>
                  ))}
                </ul>
                <Link href={p.cta.href} style={productCta}>{p.cta.label} →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...section, background: "#0b1830" }}>
        <div style={sectionInner}>
          <h2 style={{ ...sectionTitle, color: "white" }}>會員方案</h2>
          <p style={{ ...sectionLead, color: "#94a3b8" }}>
            完成註冊與付款後，立即可使用 AI 諮詢；基礎方案以上可解鎖易學決策報告。
          </p>
          <div style={pricingGrid}>
            {tiers.map((t) => (
              <article
                key={t.code}
                style={{ ...pricingCard, ...(t.highlight ? pricingCardHighlight : {}) }}
              >
                {t.highlight && <div style={pricingFlag}>推薦</div>}
                <div style={pricingName}>{t.name}</div>
                <div style={pricingPrice}>{t.price}</div>
                <div style={pricingNote}>{t.note} ｜ {t.credits}</div>
                <ul style={pricingList}>
                  {t.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link
                  href={t.href}
                  style={{ ...pricingCta, ...(t.highlight ? { background: "#efd9b8", color: "#7d4f12" } : {}) }}
                >
                  {t.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...section, padding: "80px 24px" }}>
        <div style={{ ...sectionInner, maxWidth: 800, textAlign: "center" }}>
          <h2 style={sectionTitle}>準備好把直覺，升級成數據化決策？</h2>
          <p style={sectionLead}>免費註冊立即取得 3 次體驗點數，3 分鐘內即可開始第一份諮詢。</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
            <Link href="/register" style={ctaPrimary}>免費註冊</Link>
            <Link href="/about" style={ctaSecondary}>了解風羿老師</Link>
          </div>
        </div>
      </section>

      <footer style={footer}>
        <div style={sectionInner}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: "white" }}>巽風堪輿</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>XUNFENG FIELD STRATEGY · 風羿老師</div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
              <Link href="/privacy" style={footerLink}>隱私政策</Link>
              <Link href="/about" style={footerLink}>關於</Link>
              <Link href="/booking" style={footerLink}>預約</Link>
            </div>
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: "#64748b" }}>
            © {new Date().getFullYear()} 巽風堪輿. 本系統提供易學決策輔助；涉及陽宅、陰宅、重大投資、法律、醫療或不可逆決策，仍需由風羿老師本人進一步確認或親至現場評估。
          </div>
        </div>
      </footer>
    </main>
  );
}

function ServiceCard({ item }: { item: ServiceItem }) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    item.href ? (
      <Link href={item.href} style={serviceCardLink}>
        {children}
      </Link>
    ) : (
      <div style={serviceCardLink}>{children}</div>
    );

  return (
    <Wrapper>
      <article style={{ ...serviceCard, ...(item.highlight ? serviceCardHighlight : {}) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={serviceCategoryTag}>{item.category}</div>
          {item.badge && <div style={serviceBadge(item.highlight)}>{item.badge}</div>}
        </div>
        <h4 style={serviceTitle}>{item.title}</h4>
        <p style={serviceDesc}>{item.description}</p>
        <div style={servicePriceRow}>
          <div style={servicePrice}>{item.price}</div>
          {item.note && <div style={serviceNote}>{item.note}</div>}
        </div>
        {item.href && <div style={serviceCta}>立即使用 →</div>}
      </article>
    </Wrapper>
  );
}

const categoryHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 };
const categoryDot: React.CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "#be955c" };
const categoryName: React.CSSProperties = { fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: -0.3 };
const categoryCount: React.CSSProperties = { fontSize: 12, color: "#94a3b8", fontWeight: 700 };
const categoryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 };

const serviceCardLink: React.CSSProperties = { display: "block", textDecoration: "none", color: "inherit" };
const serviceCard: React.CSSProperties = { background: "white", padding: 20, borderRadius: 18, border: "1px solid #e2e8f0", height: "100%", transition: "all 0.2s", boxShadow: "0 2px 8px rgba(16,32,58,0.04)" };
const serviceCardHighlight: React.CSSProperties = { background: "linear-gradient(135deg, #10203A 0%, #1c3458 100%)", color: "white", border: "1px solid #10203A", boxShadow: "0 12px 24px rgba(16,32,58,0.2)" };
const serviceCategoryTag: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "#7d4f12", background: "#efd9b8", padding: "3px 10px", borderRadius: 999, display: "inline-block" };
const serviceBadge = (highlight?: boolean): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 900,
  padding: "3px 10px",
  borderRadius: 999,
  background: highlight ? "#efd9b8" : "#10203A",
  color: highlight ? "#7d4f12" : "white",
  letterSpacing: 1
});
const serviceTitle: React.CSSProperties = { fontSize: 17, fontWeight: 900, margin: "12px 0 6px", letterSpacing: -0.3 };
const serviceDesc: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, margin: 0, opacity: 0.85 };
const servicePriceRow: React.CSSProperties = { marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(148,163,184,0.4)" };
const servicePrice: React.CSSProperties = { fontSize: 14, fontWeight: 900 };
const serviceNote: React.CSSProperties = { fontSize: 11, opacity: 0.7, marginTop: 4, lineHeight: 1.5 };
const serviceCta: React.CSSProperties = { fontSize: 12, fontWeight: 900, marginTop: 12, opacity: 0.9 };

const page: React.CSSProperties = { background: "#f7f9fc", color: "#10203A", fontFamily: "system-ui, -apple-system, 'PingFang TC', sans-serif", minHeight: "100vh" };
const topbar: React.CSSProperties = { position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.9)", borderBottom: "1px solid #e2e8f0", backdropFilter: "blur(12px)" };
const topbarInner: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" };
const brand: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" };
const brandMark: React.CSSProperties = { display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: "#10203A", color: "white", fontSize: 20, fontWeight: 900 };
const navActions: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" };
const navLink: React.CSSProperties = { fontSize: 14, color: "#475569", textDecoration: "none", fontWeight: 600 };
const navCta: React.CSSProperties = { fontSize: 14, color: "white", textDecoration: "none", fontWeight: 900, background: "#10203A", padding: "8px 16px", borderRadius: 12 };

const hero: React.CSSProperties = { padding: "80px 24px 64px", background: "radial-gradient(circle at top left, #ffffff, #f3f7fb 40%, #dfeaf5)" };
const heroInner: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" };
const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: 3, color: "#7d4f12", background: "#efd9b8", padding: "6px 16px", borderRadius: 999, display: "inline-block", fontWeight: 900 };
const heroTitle: React.CSSProperties = { fontSize: 56, fontWeight: 900, lineHeight: 1.15, margin: "20px 0 0", letterSpacing: -1 };
const heroAccent: React.CSSProperties = { color: "#be955c" };
const heroLead: React.CSSProperties = { fontSize: 18, lineHeight: 1.8, color: "#475569", maxWidth: 700, marginTop: 20 };
const ctaPrimary: React.CSSProperties = { background: "#10203A", color: "white", padding: "16px 28px", borderRadius: 14, fontWeight: 900, textDecoration: "none", fontSize: 15, boxShadow: "0 12px 24px rgba(16,32,58,0.2)" };
const ctaSecondary: React.CSSProperties = { background: "white", color: "#10203A", padding: "16px 28px", borderRadius: 14, fontWeight: 900, textDecoration: "none", fontSize: 15, border: "1px solid #cbd5e1" };

const section: React.CSSProperties = { padding: "64px 24px" };
const sectionInner: React.CSSProperties = { maxWidth: 1200, margin: "0 auto" };
const sectionTitle: React.CSSProperties = { fontSize: 32, fontWeight: 900, margin: 0, letterSpacing: -0.5 };
const sectionLead: React.CSSProperties = { fontSize: 16, color: "#64748b", marginTop: 8, marginBottom: 32, lineHeight: 1.7 };

const productGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24 };
const productCard: React.CSSProperties = { background: "white", padding: 32, borderRadius: 24, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(16,32,58,0.06)" };
const productBadge: React.CSSProperties = { display: "inline-block", padding: "4px 12px", borderRadius: 999, background: "#10203A", color: "white", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const productTitle: React.CSSProperties = { fontSize: 22, fontWeight: 900, marginTop: 12, marginBottom: 8 };
const productDesc: React.CSSProperties = { color: "#475569", fontSize: 14, lineHeight: 1.8 };
const productBullets: React.CSSProperties = { color: "#10203A", fontSize: 13, marginTop: 16, marginBottom: 16, paddingLeft: 0, listStyle: "none" };
const productCta: React.CSSProperties = { display: "inline-block", color: "#10203A", fontWeight: 900, fontSize: 14, textDecoration: "none", borderBottom: "2px solid #10203A", paddingBottom: 2 };

const pricingGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 };
const pricingCard: React.CSSProperties = { background: "rgba(255,255,255,0.06)", padding: 24, borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", color: "white", position: "relative" };
const pricingCardHighlight: React.CSSProperties = { background: "white", color: "#10203A", border: "none", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" };
const pricingFlag: React.CSSProperties = { position: "absolute", top: -12, right: 16, background: "#efd9b8", color: "#7d4f12", padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 900 };
const pricingName: React.CSSProperties = { fontSize: 14, fontWeight: 800, opacity: 0.8 };
const pricingPrice: React.CSSProperties = { fontSize: 36, fontWeight: 900, marginTop: 8 };
const pricingNote: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginTop: 4 };
const pricingList: React.CSSProperties = { listStyle: "none", padding: 0, margin: "20px 0", fontSize: 13, lineHeight: 1.9 };
const pricingCta: React.CSSProperties = { display: "block", textAlign: "center", padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.15)", color: "white", textDecoration: "none", fontWeight: 900, fontSize: 13 };

const footer: React.CSSProperties = { background: "#0b1830", color: "white", padding: "48px 24px" };
const footerLink: React.CSSProperties = { color: "#94a3b8", textDecoration: "none" };
