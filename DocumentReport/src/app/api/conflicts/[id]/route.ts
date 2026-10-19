import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authz";

const bodySchema = z.object({ decision: z.enum(["approve", "reject"]) });
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["Administrator"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "คำสั่งตรวจสอบไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await auth.db.rpc("resolve_received_date_conflict", { p_conflict_id: id, p_approve: parsed.data.decision === "approve" });
  if (error) return NextResponse.json({ error: error.message.includes("resolve_received_date_conflict") ? "ยังไม่ได้ติดตั้ง migration การตรวจสอบวันที่รับ" : "บันทึกผลตรวจสอบไม่สำเร็จ" }, { status: 409 });
  return NextResponse.json(data);
}

