import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, formatYnabError, ok, err, currentMonthISO } from "../utils.js";
export function registerBudgetRecommendationTools(server) {
    server.registerTool("analyze_spending_trends", {
        title: "Analyze Spending Trends",
        description: `Analyzes spending per category across multiple months and returns:
- Average monthly spending per category
- Categories consistently overspent or underspent
- Trend direction (increasing/decreasing/stable)
- Budget recommendations based on historical data`,
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            months: z.number().optional().describe("Number of past months to analyze (default: 3, max: 12)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const numMonths = Math.min(args.months ?? 3, 12);
            const monthsList = [];
            const now = new Date();
            for (let i = 1; i <= numMonths; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                monthsList.push(`${y}-${m}-01`);
            }
            const monthData = [];
            for (const month of monthsList) {
                const resp = await client.months.getBudgetMonth(args.budget_id, month);
                const cats = {};
                for (const cat of resp.data.month.categories) {
                    if (cat.deleted || cat.hidden)
                        continue;
                    cats[cat.id] = {
                        name: cat.name,
                        group: cat.category_group_name ?? "Uncategorized",
                        activity: fromMilliunits(cat.activity),
                        budgeted: fromMilliunits(cat.budgeted),
                    };
                }
                monthData.push({ month, categories: cats });
            }
            const catStats = {};
            const allCatIds = new Set(monthData.flatMap((m) => Object.keys(m.categories)));
            for (const catId of allCatIds) {
                const entries = monthData.map((m) => m.categories[catId]).filter(Boolean);
                if (!entries.length)
                    continue;
                const spending = entries.map((e) => Math.abs(e.activity));
                const budgeted = entries.map((e) => e.budgeted);
                const avgSpending = spending.reduce((s, v) => s + v, 0) / spending.length;
                const avgBudgeted = budgeted.reduce((s, v) => s + v, 0) / budgeted.length;
                const overspent = entries.filter((e) => e.activity < -e.budgeted && e.budgeted > 0).length;
                const underspent = entries.filter((e) => Math.abs(e.activity) < e.budgeted * 0.5 && e.budgeted > 0).length;
                let trend = "stable";
                if (spending.length >= 2) {
                    const half = Math.floor(spending.length / 2);
                    const firstHalf = spending.slice(0, half || 1);
                    const secondHalf = spending.slice(half || 1);
                    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
                    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
                    const diff = secondAvg - firstAvg;
                    if (diff > firstAvg * 0.1)
                        trend = "increasing";
                    else if (diff < -firstAvg * 0.1)
                        trend = "decreasing";
                }
                catStats[catId] = {
                    name: entries[0].name,
                    group: entries[0].group,
                    monthly_spending: spending,
                    monthly_budgeted: budgeted,
                    avg_spending: Math.round(avgSpending * 100) / 100,
                    avg_budgeted: Math.round(avgBudgeted * 100) / 100,
                    overspent_months: overspent,
                    underspent_months: underspent,
                    trend,
                };
            }
            const recommendations = [];
            for (const [catId, stats] of Object.entries(catStats)) {
                if (stats.avg_spending === 0)
                    continue;
                const suggested = Math.ceil(stats.avg_spending * 1.05 * 100) / 100;
                let reason = "";
                if (stats.overspent_months >= Math.ceil(numMonths / 2)) {
                    reason = `Consistently overspent (${stats.overspent_months}/${numMonths} months). Recommend increasing to cover average spending.`;
                }
                else if (stats.underspent_months >= Math.ceil(numMonths * 0.75)) {
                    reason = `Regularly underspent (${stats.underspent_months}/${numMonths} months). Consider reducing to free up funds elsewhere.`;
                }
                else if (stats.trend === "increasing") {
                    reason = "Spending trending upward. Consider increasing budget proactively.";
                }
                else if (stats.trend === "decreasing") {
                    reason = "Spending trending downward. Consider reducing budget.";
                }
                else {
                    continue;
                }
                recommendations.push({
                    category_id: catId,
                    category_name: stats.name,
                    group: stats.group,
                    avg_spend: stats.avg_spending,
                    avg_budget: stats.avg_budgeted,
                    suggested_budget: suggested,
                    reason,
                });
            }
            return ok({
                analyzed_months: monthsList,
                recommendations,
                full_stats: catStats,
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("get_monthly_spending_summary", {
        title: "Get Monthly Spending Summary",
        description: "Returns a high-level summary of income vs spending for one or more months. Useful for budget health checks.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            months: z.number().optional().describe("Number of past months to summarize (default: 3)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const numMonths = Math.min(args.months ?? 3, 12);
            const summaries = [];
            const now = new Date();
            for (let i = 0; i <= numMonths; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const month = `${y}-${m}-01`;
                try {
                    const resp = await client.months.getBudgetMonth(args.budget_id, month);
                    const mo = resp.data.month;
                    summaries.push({
                        month: mo.month,
                        income: fromMilliunits(mo.income),
                        budgeted: fromMilliunits(mo.budgeted),
                        activity: fromMilliunits(mo.activity),
                        to_be_budgeted: fromMilliunits(mo.to_be_budgeted),
                        age_of_money: mo.age_of_money,
                        net: fromMilliunits(mo.income + mo.activity),
                    });
                }
                catch {
                    // Month may not exist yet, skip
                }
            }
            return ok(summaries.sort((a, b) => a.month.localeCompare(b.month)));
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("get_uncategorized_transactions", {
        title: "Get Unapproved / Uncategorized Transactions",
        description: "Returns all unapproved transactions. Use this to find transactions that need categorization or review.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            since_date: z.string().optional().describe("Only return transactions on or after this date (YYYY-MM-DD). Defaults to start of current month."),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const sinceDate = args.since_date ?? currentMonthISO();
            const resp = await client.transactions.getTransactions(args.budget_id, sinceDate, "unapproved");
            const transactions = resp.data.transactions
                .filter((t) => !t.deleted)
                .map((t) => ({
                id: t.id,
                date: t.date,
                amount: fromMilliunits(t.amount),
                payee_name: t.payee_name,
                account_name: t.account_name,
                category_name: t.category_name,
                category_id: t.category_id,
                cleared: t.cleared,
                approved: t.approved,
                memo: t.memo,
            }));
            return ok({ count: transactions.length, transactions });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
}
//# sourceMappingURL=budget_recommendations.js.map