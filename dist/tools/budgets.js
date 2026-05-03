import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, formatYnabError, ok, err } from "../utils.js";
export function registerBudgetTools(server) {
    server.registerTool("list_budgets", {
        title: "List YNAB Budgets",
        description: "Returns all budgets accessible with the current token, including their IDs needed for other tools.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
    }, async () => {
        try {
            const client = getYnabClient();
            const resp = await client.budgets.getBudgets();
            const budgets = resp.data.budgets.map((b) => ({
                id: b.id,
                name: b.name,
                last_modified_on: b.last_modified_on,
                currency_iso_code: b.currency_format?.iso_code,
                currency_symbol: b.currency_format?.currency_symbol,
                first_month: b.first_month,
                last_month: b.last_month,
            }));
            return ok(budgets);
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("get_budget_summary", {
        title: "Get Budget Month Summary",
        description: "Returns income, budgeted, activity, and to-be-budgeted amounts for a specific month.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID (use 'last-used' for the most recently used budget)"),
            month: z.string().optional().describe("Month in YYYY-MM-01 format (defaults to current month)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const month = args.month ?? new Date().toISOString().substring(0, 7) + "-01";
            const resp = await client.months.getBudgetMonth(args.budget_id, month);
            const m = resp.data.month;
            return ok({
                month: m.month,
                income: fromMilliunits(m.income),
                budgeted: fromMilliunits(m.budgeted),
                activity: fromMilliunits(m.activity),
                to_be_budgeted: fromMilliunits(m.to_be_budgeted),
                age_of_money: m.age_of_money,
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
}
//# sourceMappingURL=budgets.js.map