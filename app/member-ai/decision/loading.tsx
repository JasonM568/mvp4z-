export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#ffffff,#f3f7fb_40%,#dfeaf5)] text-[#10203A]">
      <div className="rounded-3xl border border-white bg-white/90 px-10 py-8 text-center shadow-2xl shadow-[#10203A]/10">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#10203A]/20 border-t-[#10203A]" />
        <div className="text-lg font-black tracking-tight">巽風易學決策系統</div>
        <div className="mt-2 text-sm text-[#607089]">載入工作台中⋯</div>
      </div>
    </main>
  );
}
