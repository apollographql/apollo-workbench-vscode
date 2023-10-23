import path from 'path';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';

export class StudioGraphVariantServiceTreeItem extends TreeItem {
  constructor(
    public readonly graphId: string,
    public readonly graphVariant: string,
    public readonly name,
    public readonly sdl: string,
  ) {
    super(name, TreeItemCollapsibleState.None);
    this.contextValue = 'studioGraphVariantServiceTreeItem';
    this.iconPath = {
      light: path.join(__dirname, '..', 'media', 'graphql-logo.png'),
      dark: path.join(__dirname, '..', 'media', 'graphql-logo.png'),
    };
  }
}
