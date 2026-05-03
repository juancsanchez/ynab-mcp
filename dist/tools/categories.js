import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, toMilliunits, formatYnabError, ok, err, currentMonthISO } from "../utils.js";
export function registerCategoryTools(server) {
    server.registerTool("get_categories", {
        title: "Get Budget Categories",
        description: "Returns all budget categories with their budgeted, activity, and balance amounts for a given month.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID (use 'last-used' for the most recently used budget)"),
            month: z.string().optional().describe("Month in YYYY-MM-01 format (defaults to current month)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const month = args.month ?? currentMonthISO();
            const resp = await client.months.getBudgetMonth(args.budget_id, month);
            const categories = resp.data.month.categories;
            const grouped = {};
            for (const cat of categories) {
                if (cat.deleted || cat.hidden)
                    continue;
                const group = cat.category_group_name ?? "Uncategorized";
                if (!grouped[group])
                    grouped[group] = [];
                grouped[group].push({
                    id: cat.id,
                    name: cat.name,
                    budgeted: fromMilliunits(cat.budgeted),
                    activity: fromMilliunits(cat.activity),
                    balance: fromMilliunits(cat.balance),
                    goal_type: cat.goal_type,
                    goal_target: cat.goal_target != null ? fromMilliunits(cat.goal_target) : undefined,
                    goal_percentage_complete: cat.goal_percentage_complete,
                });
            }
            return ok({ month, category_groups: grouped });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("get_category", {
        title: "Get Single Category",
        description: "Returns detailed information for a single category in a specific month.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            category_id: z.string().describe("Category ID"),
            month: z.string().optional().describe("Month in YYYY-MM-01 format (defaults to current month)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const month = args.month ?? currentMonthISO();
            const resp = await client.categories.getMonthCategoryById(args.budget_id, month, args.category_id);
            const cat = resp.data.category;
            return ok({
                id: cat.id,
                name: cat.name,
                category_group_name: cat.category_group_name,
                budgeted: fromMilliunits(cat.budgeted),
                activity: fromMilliunits(cat.activity),
                balance: fromMilliunits(cat.balance),
                goal_type: cat.goal_type,
                goal_target: cat.goal_target != null ? fromMilliunits(cat.goal_target) : undefined,
                goal_percentage_complete: cat.goal_percentage_complete,
                note: cat.note,
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("update_category_budget", {
        title: "Update Category Budget Amount",
        description: "Sets the budgeted amount for a category in a specific month. Use this for budget recommendations.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            month: z.string().describe("Month in YYYY-MM-01 format"),
            category_id: z.string().describe("Category ID to update"),
            budgeted: z.number().describe("New budgeted amount in decimal currency (e.g. 500.00)"),
        },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const resp = await client.categories.updateMonthCategory(args.budget_id, args.month, args.category_id, { category: { budgeted: toMilliunits(args.budgeted) } });
            const cat = resp.data.category;
            return ok({
                id: cat.id,
                name: cat.name,
                budgeted: fromMilliunits(cat.budgeted),
                activity: fromMilliunits(cat.activity),
                balance: fromMilliunits(cat.balance),
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
    server.registerTool("get_overspent_categories", {
        title: "Get Overspent Categories",
        description: "Returns all categories with a negative balance (overspent) for a given month.",
        inputSchema: {
            budget_id: z.string().describe("Budget ID"),
            month: z.string().optional().describe("Month in YYYY-MM-01 format (defaults to current month)"),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => {
        try {
            const client = getYnabClient();
            const month = args.month ?? currentMonthISO();
            const resp = await client.months.getBudgetMonth(args.budget_id, month);
            const overspent = resp.data.month.categories
                .filter((cat) => !cat.deleted && !cat.hidden && cat.balance < 0)
                .map((cat) => ({
                id: cat.id,
                name: cat.name,
                category_group_name: cat.category_group_name,
                budgeted: fromMilliunits(cat.budgeted),
                activity: fromMilliunits(cat.activity),
                balance: fromMilliunits(cat.balance),
                overspent_by: fromMilliunits(Math.abs(cat.balance)),
            }))
                .sort((a, b) => a.balance - b.balance);
            return ok({
                month,
                overspent_categories: overspent,
                total_overspent: overspent.reduce((s, c) => s + c.overspent_by, 0),
            });
        }
        catch (e) {
            return err(formatYnabError(e));
        }
    });
}
//# sourceMappingURL=categories.js.map