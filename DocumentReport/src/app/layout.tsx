import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"ระบบรายงานเล่มทะเบียนหนังสือราชการ",description:"ส่วนประสานความร่วมมือด้านทรัพยากรป่าไม้และสัตว์ป่า"};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="th"><body>{children}</body></html>; }
