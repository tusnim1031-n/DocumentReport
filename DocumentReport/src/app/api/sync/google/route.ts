import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { readGoogleSheet } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireRole(["Administrator"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { count: beforeCount, error: countError } = await auth.db.from("document_records").select("id", { count: "exact", head: true });
  if (countError) return NextResponse.json({ error: "อ่านจำนวนทะเบียนก่อนซิงก์ไม่สำเร็จ" }, { status: 500 });
  const { data: job, error: jobError } = await auth.db.from("sync_jobs").insert({ source_system: "google_sheets", started_by: auth.user.id, before_count: beforeCount || 0, status: "running" }).select("id").single();
  if (jobError || !job) return NextResponse.json({ error: jobError?.code === "23505" ? "มีงานซิงก์กำลังทำงานอยู่ กรุณารอสักครู่" : "เริ่มงานซิงก์ไม่สำเร็จ" }, { status: 409 });
  const finish = async (status: "success" | "partial" | "failed", values: Record<string, unknown>) => {
    await auth.db.from("sync_jobs").update({ ...values, status, finished_at: new Date().toISOString() }).eq("id", job.id);
  };
  try {
    const parsed = await readGoogleSheet();
    const schemaIssue = parsed.issues.find(issue => issue.includes("ไม่พบหัวคอลัมน์ที่จำเป็น"));
    if (schemaIssue) {
      await finish("failed", { rows_read: 0, rows_error: 1, details: { error: schemaIssue, headers: parsed.headers } });
      return NextResponse.json({ error: schemaIssue, jobId: job.id }, { status: 422 });
    }
    const { data: batch, error: batchError } = await auth.db.from("import_batches").insert({ filename: "Google Sheets · data", uploaded_by: auth.user.id, row_count: parsed.rows.length, issues: parsed.issues.slice(0, 25), headers: parsed.headers, missing_note_column: parsed.missingNoteColumn, status: "validating" }).select("id").single();
    if (batchError || !batch) throw new Error("สร้างประวัติการนำเข้าไม่สำเร็จ");
    const { data: result, error: ingestError } = await auth.db.rpc("ingest_import_batch_from_source", { p_batch_id: batch.id, p_records: parsed.rows, p_source_system: "google_sheets" });
    if (ingestError) {
      await auth.db.from("import_batches").update({ status: "failed", issues: [...parsed.issues.slice(0, 24), ingestError.message] }).eq("id", batch.id);
      throw new Error(ingestError.message.includes("ingest_import_batch_from_source") ? "ยังไม่ได้ติดตั้ง migration สำหรับ Google Sheets กรุณาติดตั้ง migration 202610190003_google_sheets_ingest.sql" : "บันทึกข้อมูลซิงก์ไม่สำเร็จ");
    }
    const { count: afterCount } = await auth.db.from("document_records").select("id", { count: "exact", head: true });
    const values = { rows_read: parsed.rows.length, rows_added: result?.added ?? 0, rows_changed: 0, rows_unchanged: result?.unchanged ?? 0, rows_duplicate: result?.review ?? 0, rows_error: parsed.issues.length, after_count: afterCount || 0, details: { batch_id: batch.id, missing_note_column: parsed.missingNoteColumn, issues: parsed.issues.slice(0, 25), changed_fields_require_review: true } };
    await finish(parsed.issues.length ? "partial" : "success", values);
    return NextResponse.json({ ok: true, jobId: job.id, batchId: batch.id, ...values, added: values.rows_added, unchanged: values.rows_unchanged, review: values.rows_duplicate, note: parsed.missingNoteColumn ? "ไม่พบคอลัมน์หมายเหตุ จึงเว้นว่างตามข้อกำหนด" : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ซิงก์ Google Sheets ไม่สำเร็จ";
    await finish("failed", { rows_error: 1, details: { error: message } });
    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }
}

