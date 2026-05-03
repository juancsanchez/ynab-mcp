import * as ynab from "ynab";
let _client = null;
export function getYnabClient() {
    if (!_client) {
        const token = process.env.YNAB_ACCESS_TOKEN;
        if (!token) {
            throw new Error("YNAB_ACCESS_TOKEN environment variable is not set. " +
                "Generate a Personal Access Token at https://app.ynab.com/settings/developer");
        }
        _client = new ynab.API(token);
    }
    return _client;
}
//# sourceMappingURL=ynab-client.js.map