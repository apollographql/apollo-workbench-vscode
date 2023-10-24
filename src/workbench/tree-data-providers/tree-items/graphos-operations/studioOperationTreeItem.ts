import { TreeItem, TreeItemCollapsibleState } from 'vscode';

export class StudioOperationTreeItem extends TreeItem {
  constructor(
    public readonly operationId: string,
    public readonly operationName: string,
    public readonly operationSignature: string,
  ) {
    super(operationName, TreeItemCollapsibleState.None);
    this.contextValue = 'studioOperationTreeItem';
    this.description = `id:${operationId.substring(0, 6)}`;
    this.command = {
      title: 'View Operation',
      command: 'studio-graphs.viewStudioOperation',
      arguments: [this],
    };
  }
}
