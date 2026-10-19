export {};

declare global {
  interface CloudflareEnv {
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    GOOGLE_SHEETS_SPREADSHEET_ID?: string;
    GOOGLE_SHEETS_RANGE?: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  }
}

