import { TreeItem, TreeItemCollapsibleState } from 'vscode';

export class SignupTreeItem extends TreeItem {
  constructor() {
    super('Sign-up for GraphOS (free)', TreeItemCollapsibleState.None);
    this.command = {
      title: 'Sign-up with GraphOS',
      command: 'extension.signUp',
    };
  }
}
