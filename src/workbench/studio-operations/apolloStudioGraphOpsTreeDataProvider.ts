import * as vscode from 'vscode';
import { getGraphOps } from '../../studio-gql/graphClient';
import { StateManager } from '../stateManager';
import { NotLoggedInTreeItem } from '../studio-graphs/apolloStudioGraphsTreeDataProvider';

export class ApolloStudioGraphOpsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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

        let noOperationsFoundMessage = '';
        let items: { [operationName: string]: { operationId: string, operationSignature: string } } = {};
        let apiKey = StateManager.instance.globalState_userApiKey;
        if (!apiKey) return [new NotLoggedInTreeItem()];

        let selectedGraphId = StateManager.instance.globalState_selectedGraph;
        let graphVariant = StateManager.instance.globalState_selectedGraphVariant;
        if (selectedGraphId) {
            //Create objects for next for loop
            //  Return A specific account with all graphs
            let graphOps = await getGraphOps(apiKey, selectedGraphId, graphVariant);

            noOperationsFoundMessage = graphVariant ? `No operations found for ${graphOps.service?.title}@${graphVariant}` : `No operations found for ${graphOps.service?.title}`;
            if (graphOps?.service?.stats?.queryStats) {
                graphOps?.service?.stats?.queryStats.map(queryStat => {
                    if (queryStat.groupBy.queryName && queryStat.groupBy.queryId && queryStat.groupBy.querySignature) {
                        items[queryStat.groupBy.queryName] = { operationId: queryStat.groupBy.queryId, operationSignature: queryStat.groupBy.querySignature };
                    }
                })
            }
        } else return [new vscode.TreeItem('Select a graph above to load operations from Apollo Studio', vscode.TreeItemCollapsibleState.None)]

        let itemsToReturn: vscode.TreeItem[] = new Array<vscode.TreeItem>();

        for (var operationName in items) {
            let op = items[operationName];
            itemsToReturn.push(new StudioOperationTreeItem(op.operationId, operationName, op.operationSignature));
        }

        if (itemsToReturn.length > 0)
            return itemsToReturn;


        return [new vscode.TreeItem(`${noOperationsFoundMessage} in last ${StateManager.settings_daysOfOperationsToFetch} days`, vscode.TreeItemCollapsibleState.None)];
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
        this.command = {
            title: "View Operation",
            command: "studio-graphs.viewStudioOperation",
            arguments: [this]
        }
    }
}