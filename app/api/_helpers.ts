import { NextResponse } from "next/server";

export function todoApi(name: string) {
  return NextResponse.json(
    {
      ok: false,
      error: `${name} is scaffolded but not implemented yet`
    },
    { status: 501 }
  );
}

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "系統錯誤");
  return apiJson({ error: message }, status);
}
