import { resolve } from "path";
import { CancellationTokenSource, Event, ExtensionContext, window, workspace } from "vscode";
import { getUserMemberships } from "../studio-gql/graphClient";
import { CurrentWorkbenchOpsTreeDataProvider } from "./current-workbench-queries/currentWorkbenchOpsTreeDataProvider";
import { CurrentWorkbenchSchemasTreeDataProvider } from "./current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider";
import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFile } from "./local-workbench-files/localWorkbenchFilesTreeDataProvider";
import { ApolloStudioGraphsTreeDataProvider } from "./studio-graphs/apolloStudioGraphsTreeDataProvider";
import { ApolloStudioGraphOpsTreeDataProvider } from "./studio-operations/apolloStudioGraphOpsTreeDataProvider";

export class StateManager {
    static context: ExtensionContext;
    static localWorkbenchFilesProvider: LocalWorkbenchFilesTreeDataProvider;
    static currentWorkbenchSchemasProvider: CurrentWorkbenchSchemasTreeDataProvider;
    static currentWorkbenchOperationsProvider: CurrentWorkbenchOpsTreeDataProvider;
    static apolloStudioGraphsProvider: ApolloStudioGraphsTreeDataProvider;
    static apolloStudioGraphOpsProvider: ApolloStudioGraphOpsTreeDataProvider;

    static get workspaceStoragePath(): string | undefined {
        return StateManager.context.storageUri?.fsPath;
    }
    static get workbenchGlobalStoragePath(): string {
        return StateManager.context.globalStorageUri.fsPath;
    }


    static get settings_startingServerPort(): number {
        return workspace.getConfiguration("apollo-workbench").get('startingServerPort') as number;;
    }
    static get settings_gatewayServerPort(): number {
        return workspace.getConfiguration("apollo-workbench").get('gatewayPort') as number;;
    }
    static get settings_apiKey() {
        return workspace.getConfiguration("apollo-workbench").get('graphApiKey') as string ?? process.env.APOLLO_KEY ?? "";
    }
    static get settings_graphVariant() {
        return workspace.getConfiguration("apollo-workbench").get('graphVariant') as string ?? process.env.APOLLO_GRAPH_VARIANT ?? "";
    }
    static get settings_shouldRunOpRegistry() {
        return workspace.getConfiguration("apollo-workbench").get('runOperationRegistry') as boolean;
    }
    static get settings_gatewayReCompositionInterval() {
        return workspace.getConfiguration("apollo-workbench").get('gatewayReCompositionInterval') as number;
    }
    static get globalState_userApiKey() {
        return StateManager.context.globalState.get('APOLLO_KEY') as string;
    }
    static get workspaceState_selectedWorkbenchFile() {
        return StateManager.context?.workspaceState.get('selectedWbFile') as WorkbenchFile;
    }
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
    static async setGraphId(graphId: string) {
        StateManager.context.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphId);
        StateManager.apolloStudioGraphOpsProvider.refresh();
    }
    static async delteApiKey() {
        StateManager.context.globalState.update('APOLLO_KEY', "");
        StateManager.context.globalState.update('APOLLO_SELCTED_ACCOUNT', "");
        StateManager.apolloStudioGraphsProvider.refresh();
        StateManager.apolloStudioGraphOpsProvider.refresh();
    }
    static async enterApiKey() {
        let apiKey = await window.showInputBox({ placeHolder: "Enter User API Key - user:gh.michael-watson:023jr324tj....", })
        if (apiKey) {
            StateManager.context.globalState.update('APOLLO_KEY', apiKey);
            StateManager.apolloStudioGraphsProvider.refresh();
            StateManager.apolloStudioGraphOpsProvider.refresh();
        }
    }
    static updateSelectedWorkbenchFile(name: string, path: string) {
        StateManager.context.workspaceState.update("selectedWbFile", { name, path } as WorkbenchFile);
        StateManager.currentWorkbenchSchemasProvider.refresh();
        StateManager.currentWorkbenchOperationsProvider.refresh();
    }
}