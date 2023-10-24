import { TreeItem } from 'vscode';

export class AddDesignOperationTreeItem extends TreeItem {
  constructor(public readonly wbFilePath: string) {
    super(`Add operation to design`);
    this.tooltip = `Add a GraphQL operation and UI design to your workbench design`;
    this.contextValue = 'addDesignOperationTreeItem';
    this.command = {
      command: 'local-supergraph-designs.addOperation',
      title: `Add operation to design`,
      arguments: [this],
    };
  }
}
