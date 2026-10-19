# ระบบรายงานเล่มทะเบียนหนังสือราชการ

เว็บแอป Next.js/TypeScript สำหรับทะเบียนรับของส่วนประสานความร่วมมือด้านทรัพยากรป่าไม้และสัตว์ป่า ใช้ Supabase Auth และ PostgreSQL/RLS เป็นฐานบริการข้อมูล ขณะนี้โหมด Google Sheets และ Scheduler ยังไม่เปิดใช้งานจนกว่าจะได้รับการตั้งค่าฝั่งเซิร์ฟเวอร์อย่างถูกต้อง

## ติดตั้ง

1. ใช้ Node.js 20 ขึ้นไป และ PostgreSQL ผ่าน Supabase
2. ติดตั้งแพ็กเกจด้วย `npm install`
3. คัดลอก `.env.example` เป็น `.env.local` และกำหนด `NEXT_PUBLIC_SUPABASE_URL` กับ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. ใช้ Supabase CLI หรือ SQL Editor รัน `supabase/migrations/202610190001_initial_schema.sql`
5. ปิดอนุญาตสมัครสมาชิกเองใน Supabase Auth
6. เพิ่มผู้ใช้ใน Supabase Auth แล้วกำหนดโปรไฟล์/บทบาทโดยผู้ดูแล:

```sql
insert into public.profiles(id, display_name, role)
values ('<auth-user-uuid>', '<ชื่อเจ้าหน้าที่>', 'Administrator');
```

7. รัน `npm run dev`; สำหรับเครื่องจริงใช้ HTTPS และกำหนดค่า environment variables ผ่าน secret manager ของ Hosting

## Deploy บน Cloudflare Workers

โปรเจกต์ตั้งค่า `@opennextjs/cloudflare` เพื่อแปลง Next.js build ให้อยู่ในรูป Worker ก่อน deploy แล้ว ใช้ `pnpm run preview` ตรวจ runtime บน Workers หรือ `pnpm run deploy` เพื่อ build และ deploy

ถ้า deploy ผ่าน Cloudflare Workers Builds ให้ตั้ง Deploy command เป็น `pnpm run deploy` (หรือ `npm run deploy` เมื่อติดตั้งด้วย npm) แทน `npx wrangler deploy` โดยตรง คำสั่งตรงจะไม่สร้าง `.open-next/worker.js` และ Wrangler จะตีความโปรเจกต์เป็น static assets จึงเกิด error ว่าไม่พบ directory containing static files ตั้ง Build command ให้ติดตั้ง dependencies ตาม package manager ที่ใช้ และกำหนด `NEXT_PUBLIC_SUPABASE_URL` กับ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน Build variables; ตั้ง server secrets เพิ่มใน Worker secrets ตามต้องใช้จริง อย่า commit ค่า secret

Config อยู่ใน `wrangler.jsonc` และ `open-next.config.ts`; output `.open-next` ถูกสร้างระหว่าง deploy และไม่ต้อง commit หาก Cloudflare dashboard ยังมี deploy command เก่า ต้องแก้ค่าในหน้า Workers Builds ด้วย

ห้ามใส่ service role key, Google private key หรือ token ในตัวแปร `NEXT_PUBLIC_*` หรือในไฟล์ที่ commit เข้า Git แอปนี้ไม่ใช้ service role key จาก browser

## นำเข้าไฟล์

เข้าเมนู “นำเข้า Excel” แล้วเลือก `.xlsx`, `.xls` หรือ `.csv` (ไม่เกิน 10 MB) สำหรับ Excel จะอ่านชีต `data` ส่วน CSV ใช้ตารางแรก ตรวจจับหัวคอลัมน์ภาษาไทย เช่น เลขรับ, ที่, ลงวันที่, จาก, เรื่อง และวันที่รับ หากไม่มีหมายเหตุจะกำหนดค่าว่างพร้อมแจ้งสถานะ ไม่ย้ายคอลัมน์อื่นมาทดแทน ระบบบันทึก batch และตรวจรายการเทียบเลขรับ+เลขหนังสือ+วันที่รับ+หน่วยงาน+เรื่องเพื่อส่งรายการใกล้เคียงเข้าคิวตรวจสอบ โดยไม่ลบ/เขียนทับทะเบียนเดิม

ชนิดไฟล์/นามสกุล/ขนาดได้รับการตรวจสอบเบื้องต้นที่ API; MIME type ฝั่งผู้ส่งไม่ถือเป็นหลักฐานความปลอดภัย และยังควรเพิ่ม virus scanning/storage quarantine ก่อนเปิดใช้กับไฟล์จากผู้ใช้ทั่วไป

## Google Sheets และ Scheduler

ลิงก์ที่ให้มาทั้ง URL เผยแพร่และ URL Drive ยังไม่สามารถตรวจอ่านได้ในสภาพแวดล้อมนี้ จึงยังไม่ทราบหัวตารางจริงและไม่ได้เชื่อมระบบออนไลน์ อย่าใช้ URL สาธารณะกับข้อมูลที่ต้องจำกัดการเข้าถึง

สำหรับการเชื่อมจริง ให้เจ้าของชีตยกเลิกการเผยแพร่สาธารณะหากข้อมูลมีความอ่อนไหว สร้าง Google Cloud service account ที่ได้รับสิทธิ์อ่านเฉพาะชีต แชร์ชีตให้บัญชีนั้น และตั้งค่า credentials ใน secret manager ฝั่งเซิร์ฟเวอร์เท่านั้น จากนั้นพัฒนา/เปิด Google Sheets API connector พร้อมตรวจ mapping กับชีต GID `1739027634` ก่อนซิงก์จริง ขณะนี้การเชื่อม Google API, การกำหนดแหล่งหลัก/สำรอง, การอนุมัติ conflict และ scheduler ยังไม่เปิดใช้งาน

Scheduler ต้องเรียก endpoint/job ฝั่ง server ผ่าน hosting cron พร้อม secret ตรวจสอบและ lock ในฐานข้อมูล; อย่าตั้ง `setInterval` ใน browser ระบบปัจจุบันยังไม่มี cron endpoint หรือ scheduled job จึงซิงก์อัตโนมัติไม่ได้

## Authentication/RLS

ปิด self-signup แล้วสร้าง Auth user ผ่านผู้ดูแล และเพิ่มแถว `profiles` ด้วย SQL ที่แสดงด้านบน บทบาทมาจาก `profiles.role` (ข้อมูลที่เชื่อถือได้ฝั่งฐานข้อมูล) ไม่อ่านจาก user metadata ผู้ใช้ที่ไม่มี profile ถูกปฏิเสธ แอปเรียก API ด้วย session cookie และ anon key เท่านั้น

Migration เปิด RLS ทุกตารางที่มีข้อมูลส่วนบุคคล/ทะเบียน บทบาท Viewer อ่านทะเบียนได้; Officer อัปโหลดและอ่าน batch; Administrator จัดการค่าตั้งต้นและตรวจ conflict ตรวจทาน SQL policies กับโครงการจริงก่อน production และเพิ่ม rate limiting ที่ reverse proxy/API gateway ก่อนเปิดสู่สาธารณะ

## รายงาน

เลือกเมนู “รายงานเล่มทะเบียน” กำหนดช่วงวันที่/ค้นหา ตรวจจำนวนรายการและตัวอย่าง จากนั้นพิมพ์หรือเลือก Save as PDF ใน browser หน้า print ตั้ง A4 portrait ขอบ 13mm และซ่อนเมนู UI ข้อจำกัดปัจจุบันคือยังไม่ได้ฝัง Sarabun ใน PDF, ตรวจจำนวนแถวในไฟล์ PDF หลังสร้าง, ทำเลขหน้ารวม หรือทดสอบการแบ่งหน้า/การจัดวางภาษาไทยกับข้อมูลจริง จึงต้องตรวจ PDF ก่อนใช้เป็นเอกสารทางการ

เมนูส่งออก Excel สร้างไฟล์ `.xlsx` จากผลที่กรองแล้ว (เลขรับ/เลขหนังสือคงเป็นข้อความ)

## ทดสอบ

`npm test` ทดสอบ alias หัวตาราง วันที่ พ.ศ./Excel serial และเลขศูนย์นำหน้าด้วยข้อมูลสังเคราะห์เท่านั้น ไม่ใช่ผลทดสอบสิทธิ์/RLS, Google API, การ sync concurrency, PDF ภาษาไทย หรือการเก็บข้อมูลบน Supabase จริง

## สถานะการส่งมอบ

เสร็จในโค้ดเบื้องต้น: โครง Next.js, หน้า login, บทบาทจาก profiles, RLS migration, ตารางทะเบียนจาก DB, การอ่าน/ตรวจหัวตารางไฟล์, import RPC แบบ transaction, การแจ้ง suspected duplicate, dashboard จากข้อมูลจริง, ตัวกรอง, XLSX export และ print view

ยังไม่เสร็จ/ยังไม่ผ่านการทดสอบ: ตรวจแหล่งข้อมูลจริง, Google Sheets API connector, scheduler, การตั้งค่าแหล่งหลัก/สำรอง, sync-job orchestration/lock ที่ใช้งานจริง, หน้าจัดการ conflict/audit/user, การแบ่งหน้า server-side, audit trigger ครอบคลุมทุกการแก้ไข, rate limiting, virus scanning, Sarabun PDF พร้อม page totals, automated authorization/RLS/integration/e2e tests และการตรวจ security ก่อน production
# Google Sheets API (อ่านและซิงก์เข้าแอป)

แอปอ่านชีตผ่าน Google Sheets API v4 ด้วย Service Account ฝั่งเซิร์ฟเวอร์เท่านั้น ใช้ scope แบบ read-only, ชีต `data`, คอลัมน์ที่จับคู่จากหัวตาราง และไม่เขียนข้อมูลกลับ Google Sheets

1. ใน Google Cloud Console เปิด Google Sheets API แล้วสร้าง Service Account
2. แชร์ไฟล์ Spreadsheet ID `1-qvNJdIaPH3t_t-4g61VWqwsKGUQdL4S` ให้ Service Account ด้วยสิทธิ์ Viewer (ไม่ต้องให้ Editor สำหรับการอ่าน)
3. ใน Cloudflare Dashboard เปิด Worker `documentreport` > Settings > Variables and Secrets แล้วเพิ่มตัวแปร runtime ต่อไปนี้: `GOOGLE_SHEETS_SPREADSHEET_ID` (`1-qvNJdIaPH3t_t-4g61VWqwsKGUQdL4S`), `GOOGLE_SHEETS_RANGE` (`data!A1:U`), `GOOGLE_SERVICE_ACCOUNT_EMAIL` และ Secret `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` จาก JSON key ของบัญชีบริการ (เก็บเฉพาะในช่อง Secret ห้ามใส่ใน Git หรือหน้าเว็บ)
4. รัน migration `supabase/migrations/202610190003_google_sheets_ingest.sql` ใน Supabase SQL Editor เพื่อเปิด RPC ที่เก็บ source แยกจากการนำเข้าไฟล์
5. Deploy Worker ใหม่ แล้วลงชื่อเข้าใช้ด้วย Administrator ไปที่ “จัดการการซิงก์ข้อมูล” และเลือก “ซิงก์ข้อมูลทันที”

การทดสอบจาก runtime สำเร็จเมื่อได้ผลซิงก์พร้อมจำนวนอ่าน/เพิ่ม/ซ้ำ/ต้องตรวจสอบ และสถานะ Google Sheets เชื่อมต่อแล้ว การตั้งค่า Scheduler ยังไม่ได้เปิดใน Worker; ต้องกำหนด Cron Trigger และตัวเรียกงานที่ตรวจสอบสิทธิ์แยกก่อนเปิดงานอัตโนมัติ

หากหัวคอลัมน์จำเป็นเปลี่ยน ระบบปฏิเสธชุดซิงก์และเก็บทะเบียนเดิมไว้ คอลัมน์หมายเหตุจะถูกใช้เฉพาะเมื่อหัวตารางระบุหมายเหตุอย่างชัดเจน ถ้าไม่มีจะแสดงค่าว่าง

## Cloudflare Preview branch settings

In Workers Builds > Settings > Builds > Previews Base, keep Root directory as `/` and set Build command to `pnpm --dir ./DocumentReport install --frozen-lockfile && pnpm --dir ./DocumentReport exec opennextjs-cloudflare build`; set Preview command to `pnpm --dir ./DocumentReport exec wrangler preview`. The application and `wrangler.jsonc` are under the `DocumentReport/` repository subdirectory, so commands must explicitly run there. That Wrangler config must include `"previews": {}`.
