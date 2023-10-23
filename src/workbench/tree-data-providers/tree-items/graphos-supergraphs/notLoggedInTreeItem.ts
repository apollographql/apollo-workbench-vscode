import { TreeItem, TreeItemCollapsibleState } from 'vscode';

export class NotLoggedInTreeItem extends TreeItem {
  constructor() {
    super('Login with GraphOS', TreeItemCollapsibleState.None);
    this.command = {
      title: 'Login to Apollo',
      command: 'extension.login',
    };
  }
}
