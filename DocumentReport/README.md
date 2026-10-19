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
