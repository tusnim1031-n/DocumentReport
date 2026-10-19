import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["Administrator", "Officer"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: conflicts, error } = await auth.db.from("data_conflicts")
    .select("id,document_id,before_value,proposed_value,status,created_at,reviewed_by,reviewed_at")
    .eq("conflict_type", "missing_received_date").order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "อ่านรายการตรวจสอบไม่สำเร็จ" }, { status: 500 });
  const ids = [...new Set((conflicts || []).map(c => c.document_id).filter((id): id is string => Boolean(id)))];
  const { data: docs, error: docsError } = ids.length
    ? await auth.db.from("document_records").select("id,register_no,book_no,sender,subject,received_date").in("id", ids)
    : { data: [], error: null };
  if (docsError) return NextResponse.json({ error: "อ่านรายละเอียดทะเบียนไม่สำเร็จ" }, { status: 500 });
  const byId = new Map((docs || []).map(d => [d.id, d]));
  return NextResponse.json({ conflicts: (conflicts || []).map(c => ({ ...c, document: c.document_id ? byId.get(c.document_id) || null : null })) }, { headers: { "Cache-Control": "no-store" } });
}

