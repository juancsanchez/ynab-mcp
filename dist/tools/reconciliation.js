import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, formatYnabError, ok, err, subtractDays } from "../utils.js";
function toYnabSummary(t) {
    return {
        id: t.id,
        date: t.date,
        amount_decimal: fromMilliunits(t.amount),
        payee_name: t.payee_name,
        category_name: t.category_name,
        cleared: t.cleared,
        approved: t.approved,
        memo: t.memo,
        flag_color: t.flag_color ?? null,
    };
}
function payeeSimilar(a, b) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb)
        return false;
    return na.includes(nb) || nb.includes(na);
}
const bankEntrySchema = z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    amount: z.number().describe("Decimal amount. Outflows (debits) are negative (e.g. -52.40)"),
    payee_name: z.string().describe("Payee / description as shown on the bank statement"),
    reference: z.string().optional().describe("Optional bank reference number"),
});
export function registerReconciliationTools(server) {
    server.registerTool("reconcile_transactions", {
        title: "Reconcile Bank Statement vs YNAB",
        description: `Compares transactions from a bank statement against YNAB transactions for the same account and date range.
Returns:
- matched: bank entry found in YNAB with matching date and amount
- amount_mismatch: same approximate date/payee but different amounts
- missing_in_ynab: bank entry not found in YNAB at all
- duplicate: entry appears more than once in the bank statement
- unmatched_ynab_transactions: YNAB transactions not present on the bank statement

Use this to identify missing transactions, duplicates, and discrepancies before approving.`,
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            account_id: z.string().describe("Account ID to reconcile"),
            bank_transactions: z.array(bankEntrySchema).describe("Transactions from the bank statement"),
            date_tolerance_days: z.number().optional().describe("Days of tolerance for date matching (default: 2)"),
            amount_tolerance: z.number().optional().describe("Decimal amount tolerance (default: 0 = exact match)"),
        },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const bankEntries = args.bank_transactions;
            const dateTolerance = args.date_tolerance_days ?? 2;
            const amountTolerance = args.amount_tolerance ?? 0;
            if (!bankEntries.length) {
                return err("bank_transactions array is empty");
            }
            const dates = bankEntries.map((e) => e.date).sort();
            const earliestDate = subtractDays(dates[0], dateTolerance + 1);
            const resp = await client.transactions.getTransactionsByAccount(args.budget_id, args.account_id, earliestDate);
            const ynabPool = resp.data.transactions.filter((t) => !t.deleted);
            // Detect duplicates in bank statement
            const bankKeyCount = {};
            for (const entry of bankEntries) {
                const key = `${entry.date}|${entry.amount}|${entry.payee_name}`;
                bankKeyCount[key] = (bankKeyCount[key] ?? 0) + 1;
            }
            const matched = [];
            const usedYnabIds = new Set();
            for (const entry of bankEntries) {
                const key = `${entry.date}|${entry.amount}|${entry.payee_name}`;
                if (bankKeyCount[key] > 1) {
                    bankKeyCount[key]--;
                    matched.push({ bank_entry: entry, status: "duplicate" });
                    continue;
                }
                const entryMs = new Date(entry.date + "T00:00:00Z").getTime();
                // Strict match: date within tolerance AND amount within tolerance
                const strictMatch = ynabPool.find((t) => !usedYnabIds.has(t.id) &&
                    Math.abs((new Date(t.date + "T00:00:00Z").getTime() - entryMs) /
                        (1000 * 60 * 60 * 24)) <= dateTolerance &&
                    Math.abs(fromMilliunits(t.amount) - entry.amount) <= amountTolerance);
                if (strictMatch) {
                    usedYnabIds.add(strictMatch.id);
                    matched.push({
                        bank_entry: entry,
                        status: "matched",
                        ynab_transaction: toYnabSummary(strictMatch),
                    });
                    continue;
                }
                // Fuzzy match: date window + payee similarity, different amount
                const fuzzyMatch = ynabPool.find((t) => !usedYnabIds.has(t.id) &&
                    Math.abs((new Date(t.date + "T00:00:00Z").getTime() - entryMs) /
                        (1000 * 60 * 60 * 24)) <= dateTolerance &&
                    t.payee_name != null &&
                    payeeSimilar(t.payee_name, entry.payee_name));
                if (fuzzyMatch) {
                    usedYnabIds.add(fuzzyMatch.id);
                    matched.push({
                        bank_entry: entry,
                        status: "amount_mismatch",
                        ynab_transaction: toYnabSummary(fuzzyMatch),
                        discrepancy_amount: entry.amount - fromMilliunits(fuzzyMatch.amount),
                    });
                    continue;
                }
                matched.push({ bank_entry: entry, status: "missing_in_ynab" });
            }
            const unmatchedYnab = ynabPool
                .filter((t) => !usedYnabIds.has(t.id))
                .map(toYnabSummary);
            const summary = {
                total_bank_entries: bankEntries.length,
                matched: matched.filter((m) => m.status === "matched").length,
                amount_mismatches: matched.filter((m) => m.status === "amount_mismatch").length,
                missing_in_ynab: matched.filter((m) => m.status === "missing_in_ynab").length,
                duplicates_in_statement: matched.filter((m) => m.status === "duplicate").length,
                unmatched_in_ynab: unmatchedYnab.length,
            };
            const result = {
                summary,
                matches: matched,
                unmatched_ynab_transactions: unmatchedYnab,
            };
            return ok(result);
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("import_bank_transactions", {
        title: "Import Missing Bank Transactions into YNAB",
        description: `Creates YNAB transactions for bank statement entries that are missing in YNAB.
Typically used after reconcile_transactions identifies 'missing_in_ynab' entries.
Returns the list of created transaction IDs.`,
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            account_id: z.string().describe("Account ID"),
            transactions: z.array(z.object({
                date: z.string(),
                amount: z.number(),
                payee_name: z.string(),
                memo: z.string().optional(),
            })).describe("Bank transactions to import (typically the missing_in_ynab entries from reconcile_transactions)"),
            mark_cleared: z.boolean().optional().describe("Mark imported transactions as cleared (default: true)"),
        },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const markCleared = args.mark_cleared ?? true;
            const transactions = args.transactions.map((e) => ({
                account_id: args.account_id,
                date: e.date,
                amount: Math.round(e.amount * 1000),
                payee_name: e.payee_name,
                memo: e.memo,
                cleared: markCleared ? "cleared" : "uncleared",
                approved: false,
            }));
            const resp = await client.transactions.createTransactions(args.budget_id, { transactions });
            return ok({
                created: resp.data.transactions?.length ?? 0,
                transaction_ids: resp.data.transactions?.map((t) => t.id) ?? [],
                duplicate_import_ids: resp.data.duplicate_import_ids ?? [],
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
}
//# sourceMappingURL=reconciliation.js.map