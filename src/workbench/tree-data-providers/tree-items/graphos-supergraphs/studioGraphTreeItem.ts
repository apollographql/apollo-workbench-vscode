import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { StudioGraphVariantTreeItem } from './studioGraphVariantTreeItem';

export class StudioGraphTreeItem extends TreeItem {
  children: StudioGraphVariantTreeItem[] =
    new Array<StudioGraphVariantTreeItem>();
  variants: string[] = [];

  constructor(
    public readonly graphId: string,
    public readonly graphName: string,
  ) {
    super(graphName, TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'studioGraphTreeItem';
    this.command = {
      title: 'Load Graph Operations',
      command: 'studio-graphs.loadOperationsFromGraphOS',
      arguments: [this],
    };
  }
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    return new Promise(() => this.children);
  }
}
