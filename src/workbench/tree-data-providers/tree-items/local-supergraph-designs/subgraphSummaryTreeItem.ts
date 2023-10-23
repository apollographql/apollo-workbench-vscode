import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Subgraph } from '../../../file-system/ApolloConfig';
import { StateManager } from '../../../stateManager';
import { media } from '../../superGraphTreeDataProvider';

export class SubgraphSummaryTreeItem extends TreeItem {
  subgraphs: TreeItem[] = new Array<TreeItem>();

  constructor(
    private readonly subgraphConfigs: { [subgraphName: string]: Subgraph },
    public readonly wbFilePath: string,
  ) {
    super(
      `${Object.keys(subgraphConfigs).length} subgraphs`,
      StateManager.settings_localDesigns_expandSubgraphsByDefault
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed,
    );

    this.tooltip = `${Object.keys(subgraphConfigs).length} Subgraphs`;
    this.contextValue = 'subgraphSummaryTreeItem';

    Object.keys(subgraphConfigs).forEach((subgraphName) => {
      this.subgraphs.push(
        new SubgraphTreeItem(
          subgraphName,
          subgraphConfigs[subgraphName],
          wbFilePath,
        ),
      );
    });
    this.iconPath = {
      light: media('subgraph.svg'),
      dark: media('subgraph.svg'),
    };
  }
}
