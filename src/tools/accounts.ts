import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, formatYnabError, ok, err } from "../utils.js";

export function registerAccountTools(server: McpServer) {
  server.registerTool(
    "list_accounts",
    {
      title: "List YNAB Accounts",
      description: "Returns all accounts in a budget with their current balances.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID (use 'last-used' for the most recently used budget)"),
        include_closed: z.boolean().optional().describe("Include closed accounts (default: false)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        const resp = await client.accounts.getAccounts(args.budget_id);
        const accounts = resp.data.accounts
          .filter((a) => !a.deleted && (args.include_closed || !a.closed))
          .map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            on_budget: a.on_budget,
            closed: a.closed,
            balance: fromMilliunits(a.balance),
            cleared_balance: fromMilliunits(a.cleared_balance),
            uncleared_balance: fromMilliunits(a.uncleared_balance),
            transfer_payee_id: a.transfer_payee_id,
          }));
        return ok(accounts);
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );
}
