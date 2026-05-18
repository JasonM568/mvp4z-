import { todoApi } from "../../_helpers";

export async function GET() {
  return todoApi("member/me");
}
