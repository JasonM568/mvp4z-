import { todoApi } from "../../../_helpers";

export async function POST() {
  return todoApi("payments/ecpay/return");
}

export async function GET() {
  return todoApi("payments/ecpay/return");
}
