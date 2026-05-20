export default function Loading() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <article className="panel" style={{ textAlign: "center", padding: "40px 56px" }}>
        <div
          style={{
            margin: "0 auto 14px",
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "4px solid rgba(111,240,180,.18)",
            borderTopColor: "var(--green)",
            animation: "council-spin 0.8s linear infinite"
          }}
        />
        <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: ".08em" }}>巽風易學決策系統</div>
        <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>載入工作台中⋯</div>
        <style>{`@keyframes council-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </article>
    </main>
  );
}
