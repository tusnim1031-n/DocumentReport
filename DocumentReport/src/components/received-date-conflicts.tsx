"use client";
import { useCallback, useEffect, useState } from "react";

type Conflict = {
  id: string; status: string; created_at: string; reviewed_at: string | null;
  before_value: Record<string, unknown>; proposed_value: Record<string, unknown>;
  document: { register_no: string; book_no: string; sender: string; subject: string; received_date: string | null } | null;
};
const displayDate = (value: unknown) => typeof value === "string" && value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH") : "—";
export default function ReceivedDateConflicts({ role }: { role: string }) {
  const [rows, setRows] = useState<Conflict[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async () => { const res = await fetch("/api/conflicts", { cache: "no-store" }); const data = await res.json(); if (!res.ok) setError(data.error || "โหลดรายการไม่สำเร็จ"); else { setError(""); setRows(data.conflicts || []); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id); setError("");
    try { const res = await fetch(`/api/conflicts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "บันทึกผลไม่สำเร็จ"); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "บันทึกผลไม่สำเร็จ"); }
    finally { setBusy(""); }
  }
  const pending = rows.filter(r => r.status === "pending");
  return <section className="card section">
    <div className="row"><div><h3 style={{ margin: 0 }}>ตรวจสอบวันที่รับที่พบจากแหล่งข้อมูล</h3><p className="metric-note">รายการเดิมที่ตรงกันแต่ยังไม่มีวันที่รับจะรอการตรวจสอบก่อนแก้ไขทะเบียน</p></div><button className="btn" onClick={() => void load()}>รีเฟรช</button></div>
    {error && <div className="notice warn section">{error}</div>}
    {!error && pending.length === 0 && <div className="empty">ไม่มีรายการที่รอตรวจสอบวันที่รับ</div>}
    {pending.map(row => <article key={row.id} className="conflict-card section">
      <div className="row"><strong>เลขรับ {row.document?.register_no || String(row.before_value.register_no || "—")} · ที่ {row.document?.book_no || String(row.before_value.book_no || "—")}</strong><span className="badge">รอตรวจสอบ</span></div>
      <p>{row.document?.sender || String(row.before_value.sender || "")} · {row.document?.subject || String(row.before_value.subject || "")}</p>
      <div className="date-compare"><div><small>วันที่รับในทะเบียนปัจจุบัน</small><strong>{displayDate(row.before_value.received_date)}</strong></div><span aria-hidden="true">→</span><div><small>วันที่รับจากไฟล์/Google Sheets</small><strong>{displayDate(row.proposed_value.received_date)}</strong></div></div>
      <p className="metric-note">บันทึกเมื่อ {new Date(row.created_at).toLocaleString("th-TH")} · การอนุมัติจะเติมวันที่รับในทะเบียนเดิมและบันทึกผู้อนุมัติ</p>
      {role === "Administrator" ? <div className="toolbar"><button className="btn primary" disabled={!!busy} onClick={() => void decide(row.id, "approve")}>{busy === row.id ? "กำลังบันทึก…" : "อนุมัติเติมวันที่รับ"}</button><button className="btn" disabled={!!busy} onClick={() => void decide(row.id, "reject")}>ปฏิเสธ</button></div> : <p className="metric-note">การตัดสินใจทำได้โดย Administrator</p>}
    </article>)}
    {rows.some(r => r.status !== "pending") && <details className="section"><summary>ประวัติที่ตรวจสอบแล้ว ({rows.filter(r => r.status !== "pending").length})</summary>{rows.filter(r => r.status !== "pending").map(r => <p key={r.id}>เลขรับ {r.document?.register_no || String(r.before_value.register_no || "—")} · {displayDate(r.proposed_value.received_date)} · {r.status === "approved" ? "อนุมัติ" : "ปฏิเสธ"} · {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString("th-TH") : ""}</p>)}</details>}
  </section>;
}

