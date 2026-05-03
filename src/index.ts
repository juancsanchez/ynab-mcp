import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBudgetTools } from "./tools/budgets.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerPayeeTools } from "./tools/payees.js";
import { registerReconciliationTools } from "./tools/reconciliation.js";
import { registerBudgetRecommendationTools } from "./tools/budget_recommendations.js";

const server = new McpServer({
  name: "ynab-mcp",
  version: "1.0.0",
});

registerBudgetTools(server);
registerAccountTools(server);
registerTransactionTools(server);
registerCategoryTools(server);
registerPayeeTools(server);
registerReconciliationTools(server);
registerBudgetRecommendationTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("YNAB MCP Server running on stdio");
