import { ExtensionContext, window } from "vscode";
import { getUserMemberships } from "../studio-gql/graphClient";
import { CurrentWorkbenchOpsTreeDataProvider } from "./current-workbench-queries/currentWorkbenchOpsTreeDataProvider";
import { CurrentWorkbenchSchemasTreeDataProvider } from "./current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider";
import { LocalWorkbenchFilesTreeDataProvider } from "./local-workbench-files/localWorkbenchFilesTreeDataProvider";
import { ApolloStudioGraphsTreeDataProvider } from "./studio-graphs/apolloStudioGraphsTreeDataProvider";
import { ApolloStudioGraphOpsTreeDataProvider } from "./studio-operations/apolloStudioGraphOpsTreeDataProvider";

export class StateManager {
    static context: ExtensionContext;

    static localWorkbenchFilesProvider: LocalWorkbenchFilesTreeDataProvider;
    static currentWorkbenchSchemasProvider: CurrentWorkbenchSchemasTreeDataProvider;
    static currentWorkbenchOperationsProvider: CurrentWorkbenchOpsTreeDataProvider;
    static apolloStudioGraphsProvider: ApolloStudioGraphsTreeDataProvider;
    static apolloStudioGraphOpsProvider: ApolloStudioGraphOpsTreeDataProvider;

    static async setAccountId() {
        let accountId = '';
        let apiKey = this.context.globalState.get("APOLLO_KEY") as string;
        if (apiKey) {
            const myAccountIds = await getUserMemberships(apiKey);
            const memberships = (myAccountIds?.me as any)?.memberships;
            if (memberships?.length > 1) {
                let accountMapping: { [key: string]: string } = {};
                memberships.map(membership => {
                    let accountId = membership.account.id;
                    let accountName = membership.account.name;
                    accountMapping[accountName] = accountId;
                });

                let selectedOrgName = await window.showQuickPick(Object.keys(accountMapping), { placeHolder: "Select an account to load graphs from" }) ?? "";
                accountId = accountMapping[selectedOrgName];

            } else {
                accountId = memberships[0]?.account?.id ?? "";
            }

            if (accountId) {
                this.context.globalState.update("APOLLO_SELCTED_GRAPH_ID", "");
                this.context.globalState.update("APOLLO_SELCTED_ACCOUNT", accountId);

                StateManager.apolloStudioGraphsProvider.refresh();
                StateManager.apolloStudioGraphOpsProvider.refresh();
            }
        }
    }
}