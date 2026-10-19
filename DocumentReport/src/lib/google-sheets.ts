import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mapHeaders, parseDate } from "./importer";
import type { ImportResult } from "./types";

type GoogleEnv = {
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;
  GOOGLE_SHEETS_RANGE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
};

async function config(): Promise<GoogleEnv> {
  let runtime: GoogleEnv = {};
  try { runtime = (await getCloudflareContext({ async: true })).env; } catch { /* local development */ }
  return {
    GOOGLE_SHEETS_SPREADSHEET_ID: runtime.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1-qvNJdIaPH3t_t-4g61VWqwsKGUQdL4S",
    GOOGLE_SHEETS_RANGE: runtime.GOOGLE_SHEETS_RANGE || process.env.GOOGLE_SHEETS_RANGE || "data!A1:U",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: runtime.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: runtime.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const encoder = new TextEncoder();

async function accessToken(email: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(encoder.encode(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const unsigned = `${head}.${claim}`;
  const keyData = Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned)));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }) });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google did not return an access token");
  return data.access_token;
}

export function parseGoogleValues(matrix: unknown[][]): ImportResult {
  if (!matrix.length) return { headers: [], rows: [], issues: ["ชีตไม่มีข้อมูล"], missingNoteColumn: true };
  const headers = matrix[0].map(v => String(v ?? ""));
  const index = mapHeaders(headers);
  // This register's supplied sheet layout is A:U: A=register no, C=book no,
  // D=document date, E=sender, G=subject, R=received date. Note is only mapped
  // by its explicit header; it is never inferred from another column.
  const columns = { register_no: index.register_no, book_no: index.book_no, document_date: index.document_date, sender: index.sender, subject: index.subject, received_date: index.received_date, note: index.note };
  const needed: (keyof typeof columns)[] = ["register_no", "book_no", "document_date", "sender", "subject", "received_date"];
  const missingHeaders = needed.filter(k => index[k] < 0);
  if (missingHeaders.length) return { headers, rows: [], issues: [`ไม่พบหัวคอลัมน์ที่จำเป็น: ${missingHeaders.join(", ")}`], missingNoteColumn: columns.note < 0 };
  const issues: string[] = [];
  const rows = matrix.slice(1).filter(row => row.some(v => String(v ?? "").trim())).map((row, i) => {
    const out: Record<string, unknown> = { _row: i + 2 };
    for (const key of needed) {
      const value = row[columns[key]] ?? "";
      out[key] = key.endsWith("date") ? parseDate(String(value)) : String(value).trim();
    }
    out.note = columns.note >= 0 ? String(row[columns.note] ?? "").trim() : "";
    if (!out.register_no) issues.push(`แถว ${i + 2}: ไม่มีเลขรับ`);
    return out;
  });
  return { headers, rows, issues, missingNoteColumn: columns.note < 0 };
}

export async function readGoogleSheet(): Promise<ImportResult> {
  const c = await config();
  if (!c.GOOGLE_SERVICE_ACCOUNT_EMAIL || !c.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) throw new Error("ยังไม่ได้ตั้งค่า Google Service Account ใน Cloudflare Runtime Variables and Secrets");
  const token = await accessToken(c.GOOGLE_SERVICE_ACCOUNT_EMAIL, c.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"));
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(c.GOOGLE_SHEETS_SPREADSHEET_ID!)}/values/${encodeURIComponent(c.GOOGLE_SHEETS_RANGE!)}`);
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`อ่าน Google Sheets ไม่สำเร็จ (${response.status})`);
  const payload = await response.json() as { values?: unknown[][] };
  return parseGoogleValues(payload.values || []);
}

