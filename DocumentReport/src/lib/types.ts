export type DocumentRecord = {
  id: string; register_no: string; book_no: string; document_date: string | null;
  sender: string; subject: string; received_date: string | null; note: string;
  sources?: string[];
};
export type ImportResult = { headers: string[]; rows: Record<string, unknown>[]; issues: string[]; missingNoteColumn: boolean };
