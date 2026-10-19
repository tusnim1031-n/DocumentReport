import {NextResponse} from "next/server";import {createClient} from "@/lib/supabase/server";
export async function POST(){const db=await createClient();if(db)await db.auth.signOut();return NextResponse.json({ok:true});}
