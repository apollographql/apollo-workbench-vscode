import path from 'path';
import * as vscode from 'vscode';
import { getAccountGraphs, getGraphSchemasByVariant, getUserMemberships } from '../../studio-gql/graphClient';
import { GetGraphSchemas_service_implementingServices_FederatedImplementingServices } from '../../studio-gql/types/GetGraphSchemas';


export class ApolloStudioGraphsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private workspaceRoot: string, public context: vscode.ExtensionContext) { }

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StudioAccountTreeItem): Promise<vscode.TreeItem[]> {
        if (element) return element.children;
        let items: vscode.TreeItem[] = new Array<vscode.TreeItem>();

        let apiKey = this.context.globalState.get("APOLLO_KEY") as string;
        if (apiKey) {
            let accountId = this.context.globalState.get("APOLLO_SELCTED_ACCOUNT") as string;
            if (!accountId) {
                const myAccountIds = await getUserMemberships(apiKey);
                const memberships = (myAccountIds?.me as any)?.memberships;
                if (memberships?.length > 1) {
                    let accountIds: string[] = new Array<string>();
                    memberships.map(membership => accountIds.push(membership.account.id));

                    accountId = await vscode.window.showQuickPick(accountIds, { placeHolder: "Select an account to load graphs from" }) ?? "";
                } else {
                    accountId = memberships[0]?.account?.id ?? "";
                }
            }

            if (accountId) {
                this.context.globalState.update("APOLLO_SELCTED_ACCOUNT", accountId);

                //Create objects for next for loop
                //  Return A specific account with all graphs
                let accountTreeItem = new StudioAccountTreeItem(accountId);
                let services = await getAccountGraphs(apiKey, accountId);

                if (services?.account?.services) {
                    let accountServiceTreeItems = new Array<StudioGraphTreeItem>();

                    for (var j = 0; j < services?.account?.services.length ?? 0; j++) {
                        //Cast graph
                        let graph = services?.account?.services[j];
                        //Create objects for next for loop
                        //  Return A specific Graph with all variants
                        let graphTreeItem = new StudioGraphTreeItem(graph.id);
                        let graphVariantTreeItems = new Array<StudioGraphVariantTreeItem>();

                        //Loop through graph variants and add to return objects
                        for (var k = 0; k < graph.variants.length; k++) {
                            //Cast graph variant
                            let graphVariant = graph.variants[k];
                            //Create objects for next for loop
                            //  Return A specific graph variant with all implementing services
                            let accountgraphVariantTreeItem = new StudioGraphVariantTreeItem(graph.id, graphVariant.name);
                            let graphVariantServiceTreeItems = new Array<StudioGraphVariantServiceTreeItem>();

                            //Query Studio for graph by variant
                            let variantServices = await getGraphSchemasByVariant(apiKey, graph.id, graphVariant.name);
                            let implementingServices = variantServices.service?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;

                            //Loop through implemnting services and add to return objects
                            for (var l = 0; l < implementingServices.services.length; l++) {
                                let implemntingService = implementingServices.services[l];
                                graphVariantServiceTreeItems.push(new StudioGraphVariantServiceTreeItem(graph.id, graphVariant.name, implemntingService.name, implemntingService.activePartialSchema.sdl));
                            }
                            // Set the implementing service tree items on the return objects
                            accountgraphVariantTreeItem.children = graphVariantServiceTreeItems;
                            graphVariantTreeItems.push(accountgraphVariantTreeItem);
                        }
                        //Set the implementing service tree items on the return objects 
                        graphTreeItem.children = graphVariantTreeItems;
                        accountServiceTreeItems.push(graphTreeItem);
                    }

                    accountTreeItem.children = accountServiceTreeItems;
                }
                items.push(accountTreeItem);
            }
            return items;
        }

        if (items.length == 0) {
            items.push(new vscode.TreeItem("Please login using your personal user API key", vscode.TreeItemCollapsibleState.None));
        }

        return items;
    }
}

export class StudioAccountTreeItem extends vscode.TreeItem {
    children: StudioGraphTreeItem[] = new Array<StudioGraphTreeItem>();

    constructor(
        public readonly accountId: string
    ) {
        super(accountId, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'studioAccountTreeItem';
    }
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        return new Promise(() => this.children);
    }
}

export class StudioGraphTreeItem extends vscode.TreeItem {
    children: StudioGraphVariantTreeItem[] = new Array<StudioGraphVariantTreeItem>();

    constructor(
        public readonly graphId: string
    ) {
        super(graphId, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'studioGraphTreeItem';
        this.command =
        {
            title: "Load Graph Operations",
            command: "studio-graphs.loadOperations",
            arguments: [this]
        }
    }
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class StudioGraphVariantTreeItem extends vscode.TreeItem {
    children: StudioGraphVariantServiceTreeItem[] = new Array<StudioGraphVariantServiceTreeItem>();

    constructor(
        public readonly graphId: string,
        public readonly graphVariant: string
    ) {
        super(graphVariant, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'studioGraphVariantTreeItem';
    }
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        return new Promise(() => this.children);
    }
}

export class StudioGraphVariantServiceTreeItem extends vscode.TreeItem {
    constructor(
        public readonly graphId: string,
        public readonly graphVariant: string,
        public readonly name,
        public readonly sdl: string
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'studioGraphVariantServiceTreeItem';
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
            dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
        };
    }
}