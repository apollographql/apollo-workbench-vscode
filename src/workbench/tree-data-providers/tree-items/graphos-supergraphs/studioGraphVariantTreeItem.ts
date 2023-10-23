import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { StudioGraphVariantServiceTreeItem } from './studioGraphVariantServiceTreeItem';

export class StudioGraphVariantTreeItem extends TreeItem {
  children: StudioGraphVariantServiceTreeItem[] =
    new Array<StudioGraphVariantServiceTreeItem>();

  constructor(
    public readonly graphId: string,
    public readonly graphVariant: string,
  ) {
    super(graphVariant, TreeItemCollapsibleState.None);
    this.contextValue = 'studioGraphVariantTreeItem';
    this.command = {
      title: 'Load Graph Operations',
      command: 'studio-graphs.loadOperationsFromGraphOS',
      arguments: [this, graphVariant],
    };
  }
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    return new Promise(() => this.children);
  }
}
