import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { StateManager } from '../../../stateManager';
import { Operation } from '../../../file-system/ApolloConfig';
import { OperationTreeItem } from './operationTreeItem';

export class OperationSummaryTreeItem extends TreeItem {
  operations: TreeItem[] = new Array<TreeItem>();

  constructor(
    private readonly operationConfigs: {
      [operationName: string]: Operation;
    } = {},
    public readonly wbFilePath: string,
  ) {
    super(
      `${Object.keys(operationConfigs ?? []).length} Operations`,
      StateManager.settings_localDesigns_expandOperationsByDefault
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed,
    );

    this.tooltip = `${Object.keys(operationConfigs ?? []).length} operations`;
    this.contextValue = 'operationSummaryTreeItem';

    Object.keys(operationConfigs ?? []).forEach((operationName) =>
      this.operations.push(
        new OperationTreeItem(
          wbFilePath,
          operationName,
          operationConfigs[operationName],
        ),
      ),
    );
  }
}
