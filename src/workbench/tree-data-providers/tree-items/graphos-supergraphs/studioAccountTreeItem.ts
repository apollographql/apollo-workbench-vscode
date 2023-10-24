import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { StudioGraphTreeItem } from './studioGraphTreeItem';

export class StudioAccountTreeItem extends TreeItem {
  children: StudioGraphTreeItem[] = new Array<StudioGraphTreeItem>();

  constructor(
    public readonly accountId: string,
    public readonly accountName?: string,
  ) {
    super(accountName ?? accountId, TreeItemCollapsibleState.Expanded);
    this.contextValue = 'studioAccountTreeItem';
  }
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    return new Promise(() => this.children);
  }
}
