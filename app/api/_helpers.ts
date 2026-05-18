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
