import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/dashboard";
export default async function Home() {
  const supabase=await createClient();
  if(!supabase) return <main className="content"><h1 className="page-title">ระบบรายงานเล่มทะเบียนหนังสือราชการ</h1><p className="subtitle">ส่วนประสานความร่วมมือด้านทรัพยากรป่าไม้และสัตว์ป่า</p><section className="card section"><div className="notice warn">ยังไม่ได้ตั้งค่า Supabase จึงยังไม่สามารถเข้าสู่ระบบหรืออ่านข้อมูลทะเบียนได้</div><p>กำหนดค่า URL และ Anon Key ในไฟล์สภาพแวดล้อม แล้วติดตั้งฐานข้อมูลด้วย migration ใน <code>supabase/migrations</code></p><p>Google Sheets: ยังไม่ได้เชื่อมต่อออนไลน์ · กรุณาใช้การนำเข้าไฟล์หลังตั้งค่าระบบ</p></section></main>;
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:profile}=await supabase.from("profiles").select("role,display_name").eq("id",user.id).maybeSingle();
  return <Dashboard userName={profile?.display_name||user.email||"เจ้าหน้าที่"} role={profile?.role||"pending"}/>;
}
