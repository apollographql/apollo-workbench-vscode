import path from 'path';
import { getAccountGraphs, getUserMemberships } from '../../graphql/graphClient';
import { StateManager } from '../stateManager';
import { TreeItem, TreeDataProvider, EventEmitter, Event, window, commands, TreeItemCollapsibleState } from 'vscode';
import { FileProvider } from '../file-system/fileProvider';


export class ApolloStudioGraphsTreeDataProvider implements TreeDataProvider<TreeItem> {
    constructor(private workspaceRoot: string) { }

    private _onDidChangeTreeData: EventEmitter<TreeItem | undefined> = new EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData: Event<TreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    async getChildren(element?: StudioAccountTreeItem): Promise<TreeItem[]> {
        if (element) return element.children;
        let items: TreeItem[] = new Array<TreeItem>();

        let apiKey = StateManager.instance.globalState_userApiKey;
        if (apiKey) {
            let accountId = StateManager.instance.globalState_selectedApolloAccount;
            if (!accountId) {
                const myAccountIds = await getUserMemberships(apiKey);
                const memberships = (myAccountIds?.me as any)?.memberships;
                if (memberships?.length > 1) {
                    let accountIds: string[] = new Array<string>();
                    memberships.map(membership => accountIds.push(membership.account.id));

                    accountId = await window.showQuickPick(accountIds, { placeHolder: "Select an account to load graphs from" }) ?? "";
                } else {
                    accountId = memberships[0]?.account?.id ?? "";
                }
            }

            if (accountId) {
                StateManager.instance.globalState_selectedApolloAccount = accountId;

                //Create objects for next for loop
                //  Return A specific account with all graphs
                let services = await getAccountGraphs(apiKey, accountId);
                let accountTreeItem = new StudioAccountTreeItem(accountId, services?.account?.name);

                if (services?.account?.services) {
                    let accountServiceTreeItems = new Array<StudioGraphTreeItem>();

                    for (var j = 0; j < services?.account?.services.length ?? 0; j++) {
                        //Cast graph
                        let graph = services?.account?.services[j];
                        if (graph.devGraphOwner?.id) {
                            continue;
                        }
                        //Create objects for next for loop
                        //  Return A specific Graph with all variants
                        let graphTreeItem = new StudioGraphTreeItem(graph.id, graph.title);
                        let graphVariantTreeItems = new Array<StudioGraphVariantTreeItem>();

                        //Loop through graph variants and add to return objects
                        for (var k = 0; k < graph.variants.length; k++) {
                            //Cast graph variant
                            let graphVariant = graph.variants[k];
                            graphTreeItem.variants.push(graphVariant.name);

                            let accountgraphVariantTreeItem = new StudioGraphVariantTreeItem(graph.id, graphVariant.name);
                            graphVariantTreeItems.push(accountgraphVariantTreeItem);
                        }
                        if (graphVariantTreeItems.length == 0)
                            graphVariantTreeItems.push(new StudioGraphVariantTreeItem(graph.id, 'current'));

                        //Set the implementing service tree items on the return objects 
                        graphTreeItem.children = graphVariantTreeItems;
                        accountServiceTreeItems.push(graphTreeItem);
                    }

                    accountTreeItem.children = accountServiceTreeItems;
                }
                items.push(accountTreeItem);
            }

            if (StateManager.settings_displayExampleGraphs)
                items.push(new PreloadedWorkbenchTopLevel());
        } else {
            items.push(new NotLoggedInTreeItem());
            items.push(new NotLoggedInTreeItem("Login to see Example Graphs"));
            window.showInformationMessage('No user api key was found.', "Login").then(response => {
                if (response === "Login")
                    commands.executeCommand("extension.enterStudioApiKey");
            });
        }

        return items;
    }
}

export class NotLoggedInTreeItem extends TreeItem {
    constructor(message: string = "Click here to login with your user api key") {
        super(message, TreeItemCollapsibleState.None);
        this.command = {
            title: "Login to Apollo",
            command: "extension.enterStudioApiKey"
        }
    }
}

export class StudioAccountTreeItem extends TreeItem {
    children: StudioGraphTreeItem[] = new Array<StudioGraphTreeItem>();

    constructor(
        public readonly accountId: string,
        public readonly accountName?: string
    ) {
        super(accountName ?? accountId, TreeItemCollapsibleState.Expanded);
        this.contextValue = 'studioAccountTreeItem';
    }
    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}

export class StudioGraphTreeItem extends TreeItem {
    children: StudioGraphVariantTreeItem[] = new Array<StudioGraphVariantTreeItem>();
    variants: string[] = [];

    constructor(
        public readonly graphId: string,
        public readonly graphName: string
    ) {
        super(graphName, TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'studioGraphTreeItem';
        this.command =
        {
            title: "Load Graph Operations",
            command: "studio-graphs.loadOperations",
            arguments: [this]
        }
    }
    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class StudioGraphVariantTreeItem extends TreeItem {
    children: StudioGraphVariantServiceTreeItem[] = new Array<StudioGraphVariantServiceTreeItem>();

    constructor(
        public readonly graphId: string,
        public readonly graphVariant: string
    ) {
        super(graphVariant, TreeItemCollapsibleState.None);
        this.contextValue = 'studioGraphVariantTreeItem';
        this.command =
        {
            title: "Load Graph Operations",
            command: "studio-graphs.loadOperations",
            arguments: [this, graphVariant]
        }
    }
    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}

export class StudioGraphVariantServiceTreeItem extends TreeItem {
    constructor(
        public readonly graphId: string,
        public readonly graphVariant: string,
        public readonly name,
        public readonly sdl: string
    ) {
        super(name, TreeItemCollapsibleState.None);
        this.contextValue = 'studioGraphVariantServiceTreeItem';
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
            dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
        };
    }
}
export class PreloadedWorkbenchTopLevel extends TreeItem {
    children: PreloadedWorkbenchFile[] = new Array<PreloadedWorkbenchFile>();

    constructor() {
        super("Example Graphs", TreeItemCollapsibleState.Collapsed);

        let preloadedFiles = FileProvider.instance?.getPreloadedWorkbenchFiles();
        preloadedFiles.map(preloadedFile => {
            this.children.push(new PreloadedWorkbenchFile(preloadedFile.fileName));
        })
    }

    getChildren(element?: PreloadedWorkbenchTopLevel): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class PreloadedWorkbenchFile extends TreeItem {

    constructor(
        public readonly fileName: string
    ) {
        super(fileName, TreeItemCollapsibleState.None);

        this.contextValue = 'preloadedWorkbenchFile';
    }
}