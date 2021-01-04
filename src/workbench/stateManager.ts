import { GraphQLSchema } from "graphql";
import { ExtensionContext, window, workspace, StatusBarItem } from "vscode";
import { getUserMemberships } from "../studio-gql/graphClient";
import { CurrentWorkbenchOpsTreeDataProvider } from "./current-workbench-queries/currentWorkbenchOpsTreeDataProvider";
import { CurrentWorkbenchSchemasTreeDataProvider } from "./current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider";
import { FieldWithType } from "./federationCompletionProvider";
import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFile } from "./local-workbench-files/localWorkbenchFilesTreeDataProvider";
import { ApolloStudioGraphsTreeDataProvider } from "./studio-graphs/apolloStudioGraphsTreeDataProvider";
import { ApolloStudioGraphOpsTreeDataProvider } from "./studio-operations/apolloStudioGraphOpsTreeDataProvider";

export class StateManager {
    context?: ExtensionContext;

    private static _instance: StateManager;
    static get instance(): StateManager {
        if (!this._instance)
            throw new Error('You must call init() before using the state manager');

        return this._instance;
    }
    constructor(context: ExtensionContext) {
        this.context = context;
    }

    static init(context: ExtensionContext) {
        this._instance = new StateManager(context);
    }

    localWorkbenchFilesProvider: LocalWorkbenchFilesTreeDataProvider = new LocalWorkbenchFilesTreeDataProvider(workspace.rootPath ?? ".");;
    currentWorkbenchSchemasProvider: CurrentWorkbenchSchemasTreeDataProvider = new CurrentWorkbenchSchemasTreeDataProvider(workspace.rootPath ?? ".");
    currentWorkbenchOperationsProvider: CurrentWorkbenchOpsTreeDataProvider = new CurrentWorkbenchOpsTreeDataProvider(workspace.rootPath ?? ".");;
    apolloStudioGraphsProvider: ApolloStudioGraphsTreeDataProvider = new ApolloStudioGraphsTreeDataProvider(workspace.rootPath ?? ".");;
    apolloStudioGraphOpsProvider: ApolloStudioGraphOpsTreeDataProvider = new ApolloStudioGraphOpsTreeDataProvider();

    static get workspaceRoot(): string | undefined {
        return workspace.workspaceFolders ? workspace.workspaceFolders[0]?.uri?.fsPath : undefined;
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
    static get settings_daysOfOperationsToFetch(): number {
        return workspace.getConfiguration("apollo-workbench").get('daysOfOperationsToFetch') as number;;
    }
    static get settings_shouldRunOpRegistry() {
        return workspace.getConfiguration("apollo-workbench").get('runOperationRegistry') as boolean;
    }
    static get settings_gatewayReCompositionInterval() {
        return workspace.getConfiguration("apollo-workbench").get('gatewayReCompositionInterval') as number;
    }
    static get settings_displayGettingStarted() {
        return workspace.getConfiguration("apollo-workbench").get('displayGettingStarted') as boolean;
    }
    static get settings_displayExampleGraphs() {
        return workspace.getConfiguration("apollo-workbench").get('displayExampleGraphs') as boolean;
    }
    static get settings_tlsRejectUnauthorized() {
        return workspace.getConfiguration("apollo-workbench").get('tlsRejectUnauthorized') as boolean;
    }
    private get settings_apolloOrg() {
        return workspace.getConfiguration("apollo-workbench").get('apolloOrg') as string;
    }
    get globalState_userApiKey() {
        return this.context?.globalState.get('APOLLO_KEY') as string;
    }
    set globalState_userApiKey(apiKey: string) {
        this.context?.globalState.update('APOLLO_KEY', apiKey);

        if (!apiKey) this.globalState_selectedApolloAccount = "";

        this.apolloStudioGraphsProvider.refresh();
        this.apolloStudioGraphOpsProvider.refresh();
        this.localWorkbenchFilesProvider.refresh();
    }
    get globalState_selectedApolloAccount() {
        if (this.settings_apolloOrg) return this.settings_apolloOrg;
        return this.context?.globalState.get('APOLLO_SELCTED_ACCOUNT') as string;
    }
    set globalState_selectedApolloAccount(accountId: string) {
        this.context?.globalState.update("APOLLO_SELCTED_ACCOUNT", accountId);
    }
    setSelectedGraph(graphId: string, variant?: string) {
        this.context?.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphId);
        this.context?.globalState.update("APOLLO_SELCTED_GRAPH_VARIANT", variant);

        this.apolloStudioGraphOpsProvider.refresh();
    }
    get globalState_selectedGraphVariant() {
        return this.context?.globalState.get('APOLLO_SELCTED_GRAPH_VARIANT') as string;
    }
    get globalState_selectedGraph() {
        return this.context?.globalState.get('APOLLO_SELCTED_GRAPH_ID') as string;
    }
    // set globalState_selectedGraph(graphId: string) {
    //     this.context?.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphId);

    //     this.apolloStudioGraphOpsProvider.refresh();
    // }
    get workspaceState_selectedWorkbenchAvailableEntities() {
        return this.context?.workspaceState.get('selectedWorkbenchAvailableEntities') as { [serviceName: string]: { type: string, keys: { [key: string]: FieldWithType[] } }[] };
    }
    set workspaceState_selectedWorkbenchAvailableEntities(entities: { [serviceName: string]: { type: string, keys: { [key: string]: FieldWithType[] } }[] }) {
        this.context?.workspaceState.update('selectedWorkbenchAvailableEntities', entities);
    }
    get workspaceState_selectedWorkbenchFile() {
        return this.context?.workspaceState.get('selectedWbFile') as WorkbenchFile;
    }
    set workspaceState_selectedWorkbenchFile(wbFile: WorkbenchFile) {
        this.context?.workspaceState.update("selectedWbFile", wbFile);
        this.clearWorkspaceSchema();

        this.workspaceState_selectedWorkbenchAvailableEntities = {};
        this.currentWorkbenchSchemasProvider.refresh();
        this.currentWorkbenchOperationsProvider.refresh();
    }
    clearWorkspaceSchema() {
        this.context?.workspaceState.update("schema", undefined);
    }
    get workspaceState_schema() {
        return this.context?.workspaceState.get("schema") as GraphQLSchema;
    }
    set workspaceState_schema(schema: GraphQLSchema) {
        this.context?.workspaceState.update("schema", schema);
    }
}