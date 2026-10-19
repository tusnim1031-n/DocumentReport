import * as XLSX from "xlsx";
import type { ImportResult } from "./types";

const aliases: Record<string, string[]> = {
  register_no: ["เลขรับ", "เลขทะเบียนรับ", "ลำดับที่"], book_no: ["ที่", "เลขที่หนังสือ", "เลขหนังสือ"],
  document_date: ["ลงวันที่", "วันที่หนังสือ", "วันที่ลงหนังสือ"], sender: ["จาก", "หน่วยงาน", "หน่วยงานต้นทาง"],
  subject: ["เรื่อง", "ชื่อเรื่อง"], received_date: ["วันที่รับ", "รับวันที่"], note: ["หมายเหตุ", "หมายเหตุเพิ่มเติม"]
};
export const normalizeHeader = (s: string) => s.trim().replace(/[\s\u200b]+/g, "").toLocaleLowerCase("th-TH");
export function mapHeaders(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalized.findIndex(h => names.some(a => normalizeHeader(a) === h))]));
}
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
  if (typeof value === "number" && value > 1) { const d = XLSX.SSF.parse_date_code(value); if (d) return new Date(Date.UTC(d.y,d.m-1,d.d)).toISOString().slice(0,10); }
  if (typeof value !== "string" || !value.trim()) return null;
  const s=value.trim(); const m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) { const day=+m[1], month=+m[2], rawYear=+m[3], y=rawYear>=2400?rawYear-543:rawYear; if(month<1||month>12||day<1||day>31)return null; return `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`; }
  const d=new Date(s); return Number.isNaN(d.valueOf())?null:d.toISOString().slice(0,10);
}
export function parseWorkbook(data: ArrayBuffer, sheetName?: string): ImportResult {
  const wb=XLSX.read(data,{type:"array",cellDates:true,raw:false});
  const sheet=sheetName?wb.Sheets[sheetName]:wb.Sheets[wb.SheetNames[0]];
  if(!sheet) throw new Error(`ไม่พบชีต ${sheetName ?? "ข้อมูล"}`);
  const matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:true});
  if(matrix.length<1) return {headers:[],rows:[],issues:["ไฟล์ไม่มีหัวตาราง"],missingNoteColumn:true};
  const headers=matrix[0].map(v=>String(v??"")); const mapping=mapHeaders(headers);
  const required=["register_no","book_no","document_date","sender","subject","received_date"];
  const missing=required.filter(k=>mapping[k]<0);
  const issues:string[]=[]; if(missing.length) issues.push(`ไม่พบคอลัมน์ที่จำเป็น: ${missing.join(", ")}`);
  const rows=matrix.slice(1).filter(r=>r.some(v=>String(v??"").trim())).map((r,i)=>{
    const obj:Record<string,unknown>={_row:i+2};
    for(const [key,index] of Object.entries(mapping)) { const v=index>=0?r[index]:""; obj[key]=key.endsWith("date")?parseDate(v):String(v??"").trim(); }
    if(!obj.register_no) issues.push(`แถว ${i+2}: ไม่มีเลขรับ`);
    return obj;
  });
  return {headers,rows,issues,missingNoteColumn:mapping.note<0};
}
