export interface BankStatementEntry {
  date: string;
  amount: number; // decimal, outflows negative (e.g. -52.40)
  payee_name: string;
  reference?: string;
}

export type MatchStatus =
  | "matched"
  | "amount_mismatch"
  | "missing_in_ynab"
  | "duplicate";

export interface YnabTransactionSummary {
  id: string;
  date: string;
  amount_decimal: number;
  payee_name: string | null | undefined;
  category_name: string | null | undefined;
  cleared: string;
  approved: boolean;
  memo: string | null | undefined;
  flag_color: string | null | undefined;
}

export interface ReconciliationMatch {
  bank_entry: BankStatementEntry;
  status: MatchStatus;
  ynab_transaction?: YnabTransactionSummary;
  discrepancy_amount?: number; // bank_amount - ynab_amount
}

export interface ReconciliationResult {
  summary: {
    total_bank_entries: number;
    matched: number;
    amount_mismatches: number;
    missing_in_ynab: number;
    duplicates_in_statement: number;
    unmatched_in_ynab: number;
  };
  matches: ReconciliationMatch[];
  unmatched_ynab_transactions: YnabTransactionSummary[];
}
