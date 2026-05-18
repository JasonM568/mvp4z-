import { todoApi } from "../../_helpers";

export async function POST() {
  return todoApi("member/redeem");
}
