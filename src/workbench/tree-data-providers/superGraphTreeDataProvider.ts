import * as path from 'path';
import { FileProvider } from '../file-system/fileProvider';
import {
  TreeItem,
  TreeItemCollapsibleState,
  TreeDataProvider,
  EventEmitter,
  Event,
  window,
} from 'vscode';
import { newDesign } from '../../commands/local-supergraph-designs';
import { StateManager } from '../stateManager';
import { ApolloConfig } from '../file-system/ApolloConfig';
import { getFileName } from '../../utils/path';

const media = (file: string)=> path.join(
  __filename,
  '..',
  '..',
  '..',
  '..',
  'media',
  file,
);

export class LocalSupergraphTreeDataProvider
  implements TreeDataProvider<TreeItem>
{
  private _onDidChangeTreeData: EventEmitter<undefined> =
    new EventEmitter<undefined>();
  readonly onDidChangeTreeData: Event<undefined> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SupergraphTreeItem): TreeItem {
    return element;
  }

  items = new Array<SupergraphTreeItem>();

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (element == undefined) {
      this.items = new Array<SupergraphTreeItem>();
      await FileProvider.instance.refreshLocalWorkbenchFiles();
      const files = FileProvider.instance.getWorkbenchFiles();
      files.forEach((wbFile, wbFilePath) => {
        this.items.push(new SupergraphTreeItem(wbFile, wbFilePath));
      });

      if (this.items.length == 0) {
        window
          .showInformationMessage(
            'No workspace files found in current directory',
            'Create New Workbench',
          )
          .then((value) => {
            if (value === 'Create New Workbench') newDesign();
          });
      }

      return Promise.resolve(this.items);
    } else {
      switch (element.contextValue) {
        case 'supergraphTreeItem': {
          const supergraphItem = element as SupergraphTreeItem;
          const federationIdentifierItem = new FederationVersionItem(
            supergraphItem.wbFile,
            supergraphItem.filePath,
          );
        return Promise.resolve([federationIdentifierItem,  supergraphItem.subgraphsChild]);
        }
        case 'subgraphSummaryTreeItem':
          return Promise.resolve(
            (element as SubgraphSummaryTreeItem).subgraphs,
          );
        default:
          return Promise.resolve([]);
      }
    }
  }
}

export class SupergraphTreeItem extends TreeItem {
  subgraphsChild: SubgraphSummaryTreeItem;
  // operationsChild: OperationSummaryTreeItem;

  constructor(
    public readonly wbFile: ApolloConfig,
    public readonly filePath: string,
  ) {
    super(
      getFileName(filePath) ?? 'unknown',
      TreeItemCollapsibleState.Expanded,
    );
    this.subgraphsChild = new SubgraphSummaryTreeItem(wbFile, filePath);
    // this.operationsChild = new OperationSummaryTreeItem(wbFile, filePath);
    this.tooltip = (this.label as string) ?? '';

    this.contextValue = 'supergraphTreeItem';
  }
}
export class SubgraphSummaryTreeItem extends TreeItem {
  subgraphs: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly wbFile: ApolloConfig,
    public readonly filePath: string,
  ) {
    super(
      `${Object.keys(wbFile.subgraphs).length} subgraphs`,
      StateManager.settings_localDesigns_expandSubgraphsByDefault
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed,
    );

    this.tooltip = `${Object.keys(wbFile.subgraphs).length} Subgraphs`;
    this.contextValue = 'subgraphSummaryTreeItem';

    Object.keys(wbFile.subgraphs).forEach((subgraphName) => {
      this.subgraphs.push(
        new SubgraphTreeItem(
          subgraphName,
          filePath,
        ),
      );
    });
    this.iconPath = {
      light: media('subgraph.svg'),
      dark: media('subgraph.svg'),
    };
  }
}
export class SubgraphTreeItem extends TreeItem {
  children: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly subgraphName: string,
    public readonly wbFilePath: string,
  ) {
    super(subgraphName, TreeItemCollapsibleState.None);

    this.contextValue = 'subgraphTreeItem';
    this.tooltip = this.subgraphName;
    this.command = {
      command: 'local-supergraph-designs.editSubgraph',
      title: 'Edit Schema',
      arguments: [this],
    };
    this.iconPath = {
      light: media('graphql-logo.png'),
      dark: media('graphql-logo.png')
    };
  }
}
export class FederationVersionItem extends TreeItem {
  constructor(
    public readonly wbFile: ApolloConfig,
    public readonly wbFilePath: string,
  ) {
    super(
      `Apollo Federation ${wbFile.federation_version ?? '2'}`,
      TreeItemCollapsibleState.None,
    );
    
    this.contextValue = 'federationVersionItem';
    this.iconPath = media('versions.svg');
  }
}
