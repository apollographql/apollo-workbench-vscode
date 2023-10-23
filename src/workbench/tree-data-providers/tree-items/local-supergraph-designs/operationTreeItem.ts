import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Operation } from '../../../file-system/ApolloConfig';
import { media } from '../../superGraphTreeDataProvider';

export class OperationTreeItem extends TreeItem {
  constructor(
    public readonly wbFilePath: string,
    public readonly operationName: string,
    public readonly operationConfig: Operation,
  ) {
    super(operationName, TreeItemCollapsibleState.None);

    this.contextValue = 'operationTreeItem';
    this.tooltip = this.operationName;
    this.command = {
      command: 'local-supergraph-designs.viewOperationDesignSideBySide',
      title: 'Open operation in Sandbox',
      arguments: [this],
    };

    if (operationConfig.document.includes('mutation'))
      this.iconPath = media('m.svg');
    else this.iconPath = media('q.svg');
  }
}
