import * as vscode from 'vscode';
import { getGraphOps } from '../../graphql/graphClient';
import { StateManager } from '../stateManager';
import { StudioOperationTreeItem } from './tree-items/graphos-operations/studioOperationTreeItem';

export class ApolloStudioGraphOpsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined
  > = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: any): Promise<vscode.TreeItem[]> {
    if (element) return element.versions ?? element.operations;

    let noOperationsFoundMessage = '';
    const items: {
      [operationName: string]: {
        operationId: string;
        operationSignature: string;
      };
    } = {};

    const selectedGraphId = StateManager.instance.globalState_selectedGraph;
    const graphVariant = StateManager.instance.globalState_selectedGraphVariant;
    if (selectedGraphId) {
      //Create objects for next for loop
      //  Return A specific account with all graphs
      const graphOps = await getGraphOps(selectedGraphId, graphVariant);

      noOperationsFoundMessage = graphVariant
        ? `No operations found for ${graphOps.service?.title}@${graphVariant}`
        : `No operations found for ${graphOps.service?.title}`;
      if (graphOps?.service?.statsWindow?.queryStats) {
        graphOps?.service?.statsWindow?.queryStats.map((queryStat) => {
          if (
            queryStat.groupBy.queryName &&
            queryStat.groupBy.queryId &&
            queryStat.groupBy.querySignature
          ) {
            items[queryStat.groupBy.queryName] = {
              operationId: queryStat.groupBy.queryId,
              operationSignature: queryStat.groupBy.querySignature,
            };
          }
        });
      }
    } else
      return [
        new vscode.TreeItem(
          'Select a graph above to load operations from Apollo Studio',
          vscode.TreeItemCollapsibleState.None,
        ),
      ];

    const itemsToReturn: vscode.TreeItem[] = new Array<vscode.TreeItem>();

    for (const operationName in items) {
      const op = items[operationName];
      itemsToReturn.push(
        new StudioOperationTreeItem(
          op.operationId,
          operationName,
          op.operationSignature,
        ),
      );
    }

    if (itemsToReturn.length > 0) return itemsToReturn;

    return [
      new vscode.TreeItem(
        `${noOperationsFoundMessage} in last ${StateManager.settings_daysOfOperationsToFetch} days`,
        vscode.TreeItemCollapsibleState.None,
      ),
    ];
  }
}
