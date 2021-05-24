import * as path from 'path';
import { FileProvider } from '../file-system/fileProvider';
import {
  TreeItem,
  TreeItemCollapsibleState,
  TreeDataProvider,
  EventEmitter,
  Event,
  window,
  Uri,
  ThemeIcon,
} from 'vscode';
import { ApolloWorkbenchFile, WorkbenchSchema } from '../file-system/fileTypes';
import { newDesign } from '../../commands/local-supergraph-designs';
import { StateManager } from '../stateManager';

export class LocalSupergraphTreeDataProvider
  implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<undefined> = new EventEmitter<undefined>();
  readonly onDidChangeTreeData: Event<undefined> = this._onDidChangeTreeData
    .event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SupergraphTreeItem): TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (element == undefined) {
      const items = new Array<TreeItem>();
      const workbenchFiles = FileProvider.instance.refreshLocalWorkbenchFiles();
      workbenchFiles.forEach((wbFile, wbFilePath) => {
        items.push(new SupergraphTreeItem(wbFile, wbFilePath));
      });

      if (items.length == 0) {
        window
          .showInformationMessage(
            'No workspace files found in current directory',
            'Create New Workbench',
          )
          .then((value) => {
            if (value === 'Create New Workbench') newDesign();
          });
      }

      return Promise.resolve(items);
    } else {
      switch (element.contextValue) {
        case 'supergraphTreeItem': {
          const supergraphItem = element as SupergraphTreeItem;
          const subgraphItem = element as SupergraphTreeItem;

          //Support legacy composition in workbench files
          if (
            (supergraphItem.wbFile as any)?.composedSchema &&
            !subgraphItem.wbFile.supergraphSdl
          ) {
            subgraphItem.wbFile.supergraphSdl = (supergraphItem.wbFile as any)?.composedSchema;
            delete (supergraphItem.wbFile as any)?.composedSchema;
          }

          if (subgraphItem.wbFile.supergraphSdl) {
            return Promise.resolve([
              new SupergraphSchemaTreeItem(
                supergraphItem.wbFile,
                supergraphItem.filePath,
              ),
              new SupergraphApiSchemaTreeItem(
                supergraphItem.wbFile,
                supergraphItem.filePath,
              ),
              supergraphItem.subgraphsChild,
              supergraphItem.operationsChild,
            ]);
          } else {
            const invalidCompositionItem = new TreeItem(
              'INVALID COMPOSITION',
              TreeItemCollapsibleState.None,
            );
            invalidCompositionItem.iconPath = new ThemeIcon(
              'notebook-state-error',
            );
            return Promise.resolve([
              invalidCompositionItem,
              subgraphItem.subgraphsChild,
              subgraphItem.operationsChild,
            ]);
          }
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
    public readonly wbFile: ApolloWorkbenchFile,
    public readonly filePath: string,
  ) {
    super(wbFile.graphName, TreeItemCollapsibleState.Collapsed);
    this.subgraphsChild = new SubgraphSummaryTreeItem(wbFile, filePath);
    this.operationsChild = new OperationSummaryTreeItem(wbFile, filePath);
    this.tooltip = this.wbFile.graphName;

    this.contextValue = 'supergraphTreeItem';
  }
}
export class SupergraphSchemaTreeItem extends TreeItem {
  constructor(
    public readonly wbFile: ApolloWorkbenchFile,
    public readonly filePath: string,
  ) {
    super('Supergraph Schema', TreeItemCollapsibleState.None);
    this.contextValue = 'supergraphSchemaTreeItem';
    this.command = {
      command: 'local-supergraph-designs.viewSupergraphSchema',
      title: 'View Supergraph Schema',
      arguments: [this],
    };
    this.iconPath = path.join(
      __filename,
      '..',
      '..',
      '..',
      '..',
      'media',
      'supergraph.svg',
    );
  }
}
export class SupergraphApiSchemaTreeItem extends TreeItem {
  constructor(
    public readonly wbFile: ApolloWorkbenchFile,
    public readonly filePath: string,
  ) {
    super('API Schema', TreeItemCollapsibleState.None);
    this.contextValue = 'supergraphApiSchemaTreeItem';
    this.command = {
      command: 'local-supergraph-designs.viewSupergraphApiSchema',
      title: 'View API Schema for Supergraph',
      arguments: [this],
    };
    this.iconPath = {
      light: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'graphql-logo.png',
      ),
      dark: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'graphql-logo.png',
      ),
    };
  }
}
export class SubgraphSummaryTreeItem extends TreeItem {
  subgraphs: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly wbFile: ApolloWorkbenchFile,
    public readonly filePath: string,
  ) {
    super(
      `${Object.keys(wbFile.schemas).length} subgraphs`,
      TreeItemCollapsibleState.Expanded,
    );

    this.tooltip = `${Object.keys(wbFile.schemas).length} Subgraphs`;
    this.contextValue = 'subgraphSummaryTreeItem';

    Object.keys(wbFile.schemas).forEach((subgraphName) => {
      this.subgraphs.push(
        new SubgraphTreeItem(
          wbFile.graphName,
          subgraphName,
          wbFile.schemas[subgraphName],
          filePath,
        ),
      );
    });
    this.iconPath = {
      light: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'subgraph.svg',
      ),
      dark: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'subgraph.svg',
      ),
    };
  }
}
export class SubgraphTreeItem extends TreeItem {
  children: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly supergraphName: string,
    public readonly subgraphName: string,
    public readonly wbSchema: WorkbenchSchema,
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
      light: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'graphql-logo.png',
      ),
      dark: path.join(
        __filename,
        '..',
        '..',
        '..',
        '..',
        'media',
        'graphql-logo.png',
      ),
    };
  }
}
export class OperationSummaryTreeItem extends TreeItem {
  operations: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly wbFile: ApolloWorkbenchFile,
    public readonly filePath: string,
  ) {
    super(
      `${Object.keys(wbFile.operations).length} Operations`,
      TreeItemCollapsibleState.Collapsed,
    );

    this.tooltip = `${Object.keys(wbFile.operations).length} operations`;
    this.contextValue = 'operationSummaryTreeItem';

    Object.keys(wbFile.operations).forEach((operationName) => {
      this.operations.push(
        new OperationTreeItem(
          operationName,
          wbFile.operations[operationName],
          filePath,
        ),
      );
    });
  }
}
export class OperationTreeItem extends TreeItem {
  children: TreeItem[] = new Array<TreeItem>();

  constructor(
    public readonly operationName: string,
    public readonly operationString: string,
    public readonly filePath: string,
  ) {
    super(operationName, TreeItemCollapsibleState.None);

    this.contextValue = 'operationTreeItem';
    this.tooltip = this.operationName;
    this.command = {
      command: 'local-supergraph-designs.editOperation',
      title: 'Edit Operation',
      arguments: [this],
    };

    if (this.operationString.includes('mutation'))
      this.iconPath = {
        light: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg'),
        dark: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg'),
      };
    else
      this.iconPath = {
        light: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg'),
        dark: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg'),
      };
  }
}
