import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getYnabClient } from "../ynab-client.js";
import { fromMilliunits, toMilliunits, formatYnabError, ok, err } from "../utils.js";
import type {
  NewTransaction,
  ExistingTransaction,
  SaveTransactionWithIdOrImportId,
  TransactionClearedStatus,
  TransactionFlagColor,
} from "ynab";

const flagColorSchema = z.enum(["red", "orange", "yellow", "green", "blue", "purple"]);
const clearedSchema = z.enum(["cleared", "uncleared", "reconciled"]);

type ClearedStatus = TransactionClearedStatus;
type FlagColor = TransactionFlagColor;

export function registerTransactionTools(server: McpServer) {
  server.registerTool(
    "get_transactions",
    {
      title: "Get YNAB Transactions",
      description: "Returns transactions for a budget, optionally filtered by account, date range, or type.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID (use 'last-used' for the most recently used budget)"),
        account_id: z.string().optional().describe("Filter by account ID"),
        since_date: z.string().optional().describe("Only return transactions on or after this date (YYYY-MM-DD)"),
        type: z.enum(["uncategorized", "unapproved"]).optional().describe("Filter by transaction type"),
        last_knowledge_of_server: z.number().optional().describe("For incremental sync: pass server_knowledge from a previous response"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        let transactions;
        let serverKnowledge: number;

        if (args.account_id) {
          const resp = await client.transactions.getTransactionsByAccount(
            args.budget_id,
            args.account_id,
            args.since_date,
            args.type,
            args.last_knowledge_of_server
          );
          transactions = resp.data.transactions;
          serverKnowledge = resp.data.server_knowledge;
        } else {
          const resp = await client.transactions.getTransactions(
            args.budget_id,
            args.since_date,
            args.type,
            args.last_knowledge_of_server
          );
          transactions = resp.data.transactions;
          serverKnowledge = resp.data.server_knowledge;
        }

        const result = transactions
          .filter((t) => !t.deleted)
          .map((t) => ({
            id: t.id,
            date: t.date,
            amount: fromMilliunits(t.amount),
            memo: t.memo,
            cleared: t.cleared,
            approved: t.approved,
            flag_color: t.flag_color,
            account_id: t.account_id,
            account_name: t.account_name,
            payee_id: t.payee_id,
            payee_name: t.payee_name,
            category_id: t.category_id,
            category_name: t.category_name,
            transfer_account_id: t.transfer_account_id,
            subtransactions: t.subtransactions?.map((s) => ({
              id: s.id,
              amount: fromMilliunits(s.amount),
              memo: s.memo,
              payee_name: s.payee_name,
              category_id: s.category_id,
              category_name: s.category_name,
            })),
          }));

        return ok({ transactions: result, server_knowledge: serverKnowledge });
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );

  server.registerTool(
    "create_transaction",
    {
      title: "Create YNAB Transaction",
      description: "Creates a new transaction in YNAB.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID"),
        account_id: z.string().describe("Account ID where the transaction will be created"),
        date: z.string().describe("Transaction date in YYYY-MM-DD format"),
        amount: z.number().describe("Amount in decimal. Outflows (expenses) are negative (e.g. -52.40), inflows positive"),
        payee_name: z.string().optional().describe("Payee name (creates a new payee if not found)"),
        payee_id: z.string().optional().describe("Existing payee ID (alternative to payee_name)"),
        category_id: z.string().optional().describe("Category ID to assign"),
        memo: z.string().optional().describe("Transaction memo/notes"),
        cleared: clearedSchema.optional().describe("Cleared status (default: uncleared)"),
        approved: z.boolean().optional().describe("Whether to approve the transaction (default: false)"),
        flag_color: flagColorSchema.optional().describe("Flag color"),
      },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        const transaction: NewTransaction = {
          account_id: args.account_id,
          date: args.date,
          amount: toMilliunits(args.amount),
          payee_name: args.payee_name,
          payee_id: args.payee_id,
          category_id: args.category_id,
          memo: args.memo,
          cleared: args.cleared as ClearedStatus | undefined,
          approved: args.approved,
          flag_color: args.flag_color as FlagColor | undefined,
        };
        const resp = await client.transactions.createTransaction(
          args.budget_id,
          { transaction }
        );
        const t = resp.data.transaction;
        if (!t) return err("Transaction was not returned by API");
        return ok({
          id: t.id,
          date: t.date,
          amount: fromMilliunits(t.amount),
          payee_name: t.payee_name,
          category_name: t.category_name,
          cleared: t.cleared,
          approved: t.approved,
          memo: t.memo,
        });
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );

  server.registerTool(
    "update_transaction",
    {
      title: "Update YNAB Transaction",
      description: "Updates an existing transaction. Only provided fields are changed.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID"),
        transaction_id: z.string().describe("Transaction ID to update"),
        date: z.string().optional().describe("New date in YYYY-MM-DD format"),
        amount: z.number().optional().describe("New amount in decimal. Outflows negative."),
        payee_name: z.string().optional().describe("New payee name"),
        payee_id: z.string().optional().describe("New payee ID"),
        category_id: z.string().optional().describe("New category ID"),
        memo: z.string().optional().describe("New memo"),
        cleared: clearedSchema.optional().describe("New cleared status"),
        approved: z.boolean().optional().describe("Approve or unapprove the transaction"),
        flag_color: flagColorSchema.nullable().optional().describe("New flag color (null to clear)"),
      },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        // Fetch existing transaction to preserve required fields
        const existing = await client.transactions.getTransactionById(
          args.budget_id,
          args.transaction_id
        );
        const ex = existing.data.transaction;

        const transaction: ExistingTransaction = {
          account_id: ex.account_id,
          date: args.date ?? ex.date,
          amount: args.amount !== undefined ? toMilliunits(args.amount) : ex.amount,
          payee_name: args.payee_name,
          payee_id: args.payee_id ?? (args.payee_name === undefined ? ex.payee_id : undefined),
          category_id: args.category_id ?? ex.category_id ?? undefined,
          memo: args.memo ?? ex.memo ?? undefined,
          cleared: (args.cleared ?? ex.cleared) as ClearedStatus | undefined,
          approved: args.approved ?? ex.approved,
          flag_color: (args.flag_color !== undefined
            ? args.flag_color
            : ex.flag_color) as FlagColor | null | undefined,
        };

        const resp = await client.transactions.updateTransaction(
          args.budget_id,
          args.transaction_id,
          { transaction }
        );
        const t = resp.data.transaction;
        return ok({
          id: t.id,
          date: t.date,
          amount: fromMilliunits(t.amount),
          payee_name: t.payee_name,
          category_name: t.category_name,
          cleared: t.cleared,
          approved: t.approved,
          memo: t.memo,
          flag_color: t.flag_color,
        });
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );

  server.registerTool(
    "approve_transactions",
    {
      title: "Approve Multiple Transactions",
      description: "Bulk-approve a list of transaction IDs. Useful after reconciliation to approve matched transactions.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID"),
        transaction_ids: z.array(z.string()).describe("List of transaction IDs to approve"),
      },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        const transactions: SaveTransactionWithIdOrImportId[] = args.transaction_ids.map((id) => ({
          id,
          approved: true,
        }));
        const resp = await client.transactions.updateTransactions(
          args.budget_id,
          { transactions }
        );
        return ok({
          updated: resp.data.transactions?.length ?? 0,
          transaction_ids: resp.data.transactions?.map((t) => t.id) ?? [],
        });
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );

  server.registerTool(
    "flag_transaction",
    {
      title: "Flag a YNAB Transaction",
      description: "Sets or clears the flag color on a transaction. Useful for marking transactions that need review.",
      inputSchema: {
        budget_id: z.string().describe("Budget ID"),
        transaction_id: z.string().describe("Transaction ID"),
        flag_color: flagColorSchema.nullable().optional().describe("Flag color. Null or omit to clear the flag."),
        memo: z.string().optional().describe("Optional memo to add alongside the flag"),
      },
    },
    async (args) => {
      try {
        const client = getYnabClient();
        const existing = await client.transactions.getTransactionById(
          args.budget_id,
          args.transaction_id
        );
        const ex = existing.data.transaction;

        const transaction: ExistingTransaction = {
          account_id: ex.account_id,
          date: ex.date,
          amount: ex.amount,
          flag_color: (args.flag_color ?? null) as FlagColor | null | undefined,
          memo: args.memo ?? ex.memo ?? undefined,
        };

        const resp = await client.transactions.updateTransaction(
          args.budget_id,
          args.transaction_id,
          { transaction }
        );
        const t = resp.data.transaction;
        return ok({
          id: t.id,
          flag_color: t.flag_color,
          memo: t.memo,
          payee_name: t.payee_name,
          date: t.date,
          amount: fromMilliunits(t.amount),
        });
      } catch (e) {
        return err(formatYnabError(e));
      }
    }
  );
}
