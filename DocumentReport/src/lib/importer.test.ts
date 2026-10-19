import {describe,it,expect} from "vitest";import * as XLSX from "xlsx";import {decodeCsv,mapHeaders,parseCsv,parseDate,parseWorkbook} from "./importer";
describe("import validation helpers (synthetic fixture only)",()=>{
 it("maps Thai column aliases and leaves the note unmapped when absent",()=>{const m=mapHeaders(["เลขรับ","ที่","ลงวันที่","จาก","เรื่อง","วันที่รับ"]);expect(m.register_no).toBe(0);expect(m.book_no).toBe(1);expect(m.note).toBe(-1)});
 it("preserves leading zero identifiers and detects absent note",()=>{const ws=XLSX.utils.aoa_to_sheet([["เลขรับ","ที่","ลงวันที่","จาก","เรื่อง","วันที่รับ"],["0007","กค 01/2569","1/2/2569","หน่วยตัวอย่าง","เรื่องทดสอบ","2/2/2569"]]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"data");const out=parseWorkbook(XLSX.write(wb,{type:"array",bookType:"xlsx"}) as ArrayBuffer,"data");expect(out.rows[0].register_no).toBe("0007");expect(out.missingNoteColumn).toBe(true);expect(out.rows[0].document_date).toBe("2026-02-01")});
 it("reads UTF-8 CSV headers and preserves leading-zero identifiers",()=>{const csv="\uFEFFเลขรับ,ที่,ลงวันที่,จาก,เรื่อง,วันที่รับ,หมายเหตุ\n0007,กค 01/2569,1/2/2569,หน่วยตัวอย่าง,เรื่องทดสอบ,2/2/2569,";const bytes=new TextEncoder().encode(csv);const out=parseCsv(bytes.buffer);expect(out.issues).toHaveLength(0);expect(out.rows[0].register_no).toBe("0007");expect(out.rows[0].book_no).toBe("กค 01/2569")});
 it("falls back to Windows-874 for legacy Thai CSV",()=>{expect(decodeCsv(Uint8Array.from([0xa1]).buffer)).toBe("ก")});
 it("normalizes Buddhist dates once and parses Excel serial dates",()=>{expect(parseDate("01/01/2569")).toBe("2026-01-01");expect(parseDate(45659)).toBe("2025-01-02")});
});

