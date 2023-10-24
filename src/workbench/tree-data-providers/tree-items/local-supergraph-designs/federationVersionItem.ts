import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { media } from '../../superGraphTreeDataProvider';

export class FederationVersionItem extends TreeItem {
  constructor(
    public readonly wbFilePath: string,
    public readonly federation_version: string = '2',
  ) {
    super(
      `Apollo Federation v${federation_version}`,
      TreeItemCollapsibleState.None,
    );

    this.contextValue = 'federationVersionItem';
    this.iconPath = media('versions.svg');
    this.command = {
      command: 'local-supergraph-designs.changeDesignFederationVersion',
      title: 'Change Apollo Federation Version',
      arguments: [this],
    };
  }
}
