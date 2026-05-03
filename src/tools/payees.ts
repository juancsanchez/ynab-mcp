import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { formatYnabError, ok, err } from "../utils.js";

export function registerPayeeTools(server: McpServer) {
  server.registerTool(
    "get_payees",
    {
      title: "Get Payees",
      description: "Returns all payees for a budget. Useful for finding payee IDs when creating transactions.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID (use 'last-used' for the most recently used budget)"),
        search: z.string().optional().describe("Filter payees by name (case-insensitive)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        const resp = await client.payees.getPayees(args.budget_id);
        const payees = resp.data.payees
          .filter((p) => !p.deleted)
          .filter((p) => !args.search || p.name.toLowerCase().includes(args.search.toLowerCase()))
          .map((p) => ({
            id: p.id,
            name: p.name,
            transfer_account_id: p.transfer_account_id,
          }));
        return ok(payees);
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );
}
