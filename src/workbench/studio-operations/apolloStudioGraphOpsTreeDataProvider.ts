import * as vscode from 'vscode';
import { getGraphOps } from '../../studio-gql/graphClient';
import { NotLoggedInTreeItem } from '../studio-graphs/apolloStudioGraphsTreeDataProvider';

export class ApolloStudioGraphOpsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private workspaceRoot: string, public context: vscode.ExtensionContext) { }

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: any): Promise<vscode.TreeItem[]> {
        if (element)
            return element.versions ?? element.operations;

        let items: { [operationName: string]: { operationId: string, operationSignature: string } } = {};
        let apiKey = this.context.globalState.get("APOLLO_KEY") as string;
        let accountId = this.context.globalState.get("APOLLO_SELCTED_ACCOUNT") as string;
        let selectedGraphId = this.context.globalState.get("APOLLO_SELCTED_GRAPH_ID") as string;
        if (apiKey && accountId && selectedGraphId) {
            //Create objects for next for loop
            //  Return A specific account with all graphs
            let graphOps = await getGraphOps(apiKey, selectedGraphId);

            if (graphOps?.service?.stats?.queryStats) {
                graphOps?.service?.stats?.queryStats.map(queryStat => {
                    if (queryStat.groupBy.queryName && queryStat.groupBy.queryId && queryStat.groupBy.querySignature) {
                        // if (!items[queryStat.groupBy.queryName]) {
                        //     items[queryStat.groupBy.queryName] = {};
                        //     // items[queryStat.groupBy.queryName][queryStat.groupBy.queryName] = new Array<{ operationName: string, operationSignature: string }>();
                        // } else if (!items[queryStat.groupBy.queryName][queryStat.groupBy.queryName]) {
                        //     // items[queryStat.groupBy.queryName][queryStat.groupBy.queryName] = new Array<{ operationName: string, operationSignature: string }>();
                        // }

                        items[queryStat.groupBy.queryName] = { operationId: queryStat.groupBy.queryId, operationSignature: queryStat.groupBy.querySignature };
                    }


                    // if (queryStat.groupBy.clientName && queryStat.groupBy.clientVersion && queryStat.groupBy.queryName && queryStat.groupBy.querySignature) {
                    //     if (!items[queryStat.groupBy.clientName]) {
                    //         items[queryStat.groupBy.clientName] = {};
                    //         items[queryStat.groupBy.clientName][queryStat.groupBy.clientVersion] = new Array<{ operationName: string, operationSignature: string }>();
                    //     } else if (!items[queryStat.groupBy.clientName][queryStat.groupBy.clientVersion]) {
                    //         items[queryStat.groupBy.clientName][queryStat.groupBy.clientVersion] = new Array<{ operationName: string, operationSignature: string }>();
                    //     }

                    //     items[queryStat.groupBy.clientName][queryStat.groupBy.clientVersion].push({ operationName: queryStat.groupBy.queryName, operationSignature: queryStat.groupBy.querySignature });
                    // }

                })
            }
        } else
            return [new NotLoggedInTreeItem()];

        let itemsToReturn: vscode.TreeItem[] = new Array<vscode.TreeItem>();

        for (var operationName in items) {
            let op = items[operationName];
            itemsToReturn.push(new StudioOperationTreeItem(op.operationId, operationName, op.operationSignature));
        }

        // for (var clientName in items) {
        //     let clientOperations = new StudioOperationClientTreeItem(clientName);
        //     for (var clientVersion in items[clientName]) {
        //         let clientVersionOperationsItem = new StudioOperationClientVersionTreeItem(clientVersion);
        //         items[clientName][clientVersion].map(op => {
        //             clientVersionOperationsItem.operations.push(new StudioOperationTreeItem(op.operationName, op.operationSignature));
        //         })

        //         clientOperations.versions.push(clientVersionOperationsItem);
        //     }

        //     itemsToReturn.push(clientOperations);
        // }

        return itemsToReturn;
    }

}

export class StudioOperationClientTreeItem extends vscode.TreeItem {
    versions: StudioOperationClientVersionTreeItem[] = new Array<StudioOperationClientVersionTreeItem>();

    constructor(
        public readonly clientName: string
    ) {
        super(clientName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'studioOperationClientTreeItem';
    }
}

export class StudioOperationClientVersionTreeItem extends vscode.TreeItem {
    operations: StudioOperationTreeItem[] = new Array<StudioOperationTreeItem>();

    constructor(
        public readonly clientVersion: string
    ) {
        super(clientVersion, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'studioOperationClientVersionTreeItem';
    }
}

export class StudioOperationTreeItem extends vscode.TreeItem {
    constructor(
        public readonly operationId: string,
        public readonly operationName: string,
        public readonly operationSignature: string
    ) {
        super(operationName, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'studioOperationTreeItem';
        this.description = `id:${operationId.substring(0, 6)}`;
    }
}