# YNAB MCP Server

MCP server for YNAB. Use it from Claude Desktop to validate transactions against bank statements and manage budget recommendations.

## Setup

### 1. Get your YNAB Personal Access Token

Go to **[YNAB Developer Settings](https://app.ynab.com/settings/developer)** → "New Token".

### 2. Build

```bash
npm install
npm run build
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/Users/juan/Documents/ScriptsLocal/ynab-mcp/dist/index.js"],
      "env": {
        "YNAB_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the YNAB tools available.

---

## Available Tools

### Budget & Accounts
| Tool | Description |
|---|---|
| `list_budgets` | Lists all budgets with their IDs |
| `get_budget_summary` | Income / budgeted / activity for a month |
| `list_accounts` | Accounts with current balances |

### Transactions
| Tool | Description |
|---|---|
| `get_transactions` | Fetch transactions (by account, date, or type) |
| `create_transaction` | Create a new transaction |
| `update_transaction` | Update an existing transaction |
| `approve_transactions` | Bulk-approve a list of transaction IDs |
| `flag_transaction` | Set/clear flag color on a transaction |

### Categories
| Tool | Description |
|---|---|
| `get_categories` | All categories with budgeted/activity/balance for a month |
| `get_category` | Single category detail |
| `update_category_budget` | Change the budgeted amount for a category |
| `get_overspent_categories` | Categories with negative balance |

### Payees
| Tool | Description |
|---|---|
| `get_payees` | List payees (with optional name search) |

### Reconciliation (Bank Statement Validation)
| Tool | Description |
|---|---|
| `reconcile_transactions` | Compare bank statement entries vs YNAB — finds matched, mismatched, missing |
| `import_bank_transactions` | Create YNAB transactions from bank statement entries missing in YNAB |

### Budget Recommendations
| Tool | Description |
|---|---|
| `analyze_spending_trends` | Analyzes N months of history and returns recommendations |
| `get_monthly_spending_summary` | High-level income vs spending per month |
| `get_uncategorized_transactions` | Unapproved/uncategorized transactions needing attention |

---

## Usage Examples

### Validate a bank statement
Ask Claude:
> "Compare these transactions from my bank statement against my YNAB checking account for May:
> - 2025-05-01, -50.00, Supermarket
> - 2025-05-03, -120.00, Electric Company
> - 2025-05-05, 1500.00, Employer Payroll"

Claude will call `reconcile_transactions` and return which are matched, which are missing, and any discrepancies.

### Budget recommendations
> "Analyze my last 3 months of spending and recommend budget adjustments."

Claude will call `analyze_spending_trends` and suggest specific category budget changes.

### Review unapproved transactions
> "Show me all unapproved transactions this month and help me categorize them."

Claude will call `get_uncategorized_transactions` and help you bulk-update categories.

---

## Development

```bash
npm run dev        # watch mode
npm run inspector  # open MCP inspector UI for testing
```
