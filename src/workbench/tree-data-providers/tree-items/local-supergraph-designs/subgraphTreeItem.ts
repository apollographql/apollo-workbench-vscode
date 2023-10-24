import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Subgraph } from '../../../file-system/ApolloConfig';
import { media } from '../../superGraphTreeDataProvider';

export class SubgraphTreeItem extends TreeItem {
  constructor(
    public readonly subgraphName: string,
    public readonly subgraph: Subgraph,
    public readonly wbFilePath: string,
  ) {
    super(
      subgraph.schema.mocks?.enabled
        ? `${subgraphName} (mocked)`
        : subgraphName,
      TreeItemCollapsibleState.None,
    );

    this.contextValue = 'subgraphTreeItem';
    this.tooltip = this.subgraphName;
    this.command = {
      command: 'local-supergraph-designs.editSubgraph',
      title: 'Edit Schema',
      arguments: [this],
    };
    this.iconPath = {
      light: media('graphql-logo.png'),
      dark: media('graphql-logo.png'),
    };
  }
}
