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
import { ApolloConfig, Operation, Subgraph } from '../file-system/ApolloConfig';
import { getFileName } from '../../utils/path';

const media = (file: string) =>
  path.join(__filename, '..', '..', '..', '..', 'media', file);

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
            supergraphItem.wbFile.federation_version,
          );
          const treeItems: any[] = [
            federationIdentifierItem,
            supergraphItem.subgraphsChild,
          ];
          if (Object.keys(supergraphItem.wbFile.operations).length > 0) {
            treeItems.push(supergraphItem.operationsChild);
          } else {
            treeItems.push(
              new AddDesignOperationTreeItem(supergraphItem.wbFilePath),
            );
          }

          return Promise.resolve(treeItems);
        }
        case 'subgraphSummaryTreeItem':
          return Promise.resolve(
            (element as SubgraphSummaryTreeItem).subgraphs,
          );
        case 'operationSummaryTreeItem':
          return Promise.resolve(
            (element as OperationSummaryTreeItem).operations,
          );
        default:
          return Promise.resolve([]);
      }
    }
  }
}

export class SupergraphTreeItem extends TreeItem {
  subgraphsChild: SubgraphSummaryTreeItem;
  operationsChild: OperationSummaryTreeItem;

  constructor(
    public readonly wbFile: ApolloConfig,
    public readonly wbFilePath: string,
  ) {
    super(
      getFileName(wbFilePath) ?? 'unknown',
      TreeItemCollapsibleState.Expanded,
    );
    this.subgraphsChild = new SubgraphSummaryTreeItem(
      wbFile.subgraphs,
      wbFilePath,
    );
    this.operationsChild = new OperationSummaryTreeItem(
      wbFile.operations,
      wbFilePath,
    );
    this.tooltip = (this.label as string) ?? '';

    this.contextValue = 'supergraphTreeItem';
  }
}
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
      this.subgraphs.push(new SubgraphTreeItem(subgraphName, wbFilePath));
    });
    this.iconPath = {
      light: media('subgraph.svg'),
      dark: media('subgraph.svg'),
    };
  }
}
export class SubgraphTreeItem extends TreeItem {
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
      dark: media('graphql-logo.png'),
    };
  }
}
export class AddDesignOperationTreeItem extends TreeItem {
  constructor(public readonly wbFilePath: string) {
    super(`Add operation to design`);
    this.tooltip = `Add a GraphQL operation and UI design to your workbench design`;
    this.contextValue = 'addDesignOperationTreeItem';
    this.command = {
      command: 'local-supergraph-designs.addOperation',
      title: `Add operation to design`,
      arguments: [this],
    };
  }
}
export class OperationSummaryTreeItem extends TreeItem {
  operations: TreeItem[] = new Array<TreeItem>();

  constructor(
    private readonly operationConfigs: {
      [operationName: string]: Operation;
    } = {},
    public readonly wbFilePath: string,
  ) {
    super(
      `${Object.keys(operationConfigs ?? []).length} Operations`,
      StateManager.settings_localDesigns_expandOperationsByDefault
        ? TreeItemCollapsibleState.Expanded
        : TreeItemCollapsibleState.Collapsed,
    );

    this.tooltip = `${Object.keys(operationConfigs ?? []).length} operations`;
    this.contextValue = 'operationSummaryTreeItem';

    Object.keys(operationConfigs ?? []).forEach((operationName) =>
      this.operations.push(
        new OperationTreeItem(
          wbFilePath,
          operationName,
          operationConfigs[operationName],
        ),
      ),
    );
  }
}
export class OperationTreeItem extends TreeItem {
  constructor(
    public readonly wbFilePath: string,
    public readonly operationName: string,
    public readonly operationConfig: Operation,
  ) {
    super(operationName, TreeItemCollapsibleState.None);

    this.contextValue = 'operationTreeItem';
    this.tooltip = this.operationName;
    this.command = {
      command: 'local-supergraph-designs.viewOperationDesignSideBySide',
      title: 'Open operation in Sandbox',
      arguments: [this],
    };

    if (operationConfig.document.includes('mutation'))
      this.iconPath = media('m.svg');
    else this.iconPath = media('q.svg');
  }
}

export class FederationVersionItem extends TreeItem {
  constructor(public readonly federation_version: string = '2') {
    super(
      `Apollo Federation v${federation_version}`,
      TreeItemCollapsibleState.None,
    );

    this.contextValue = 'federationVersionItem';
    this.iconPath = media('versions.svg');
  }
}
