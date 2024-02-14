import * as path from 'path';
import { FileProvider } from '../file-system/fileProvider';
import {
  TreeItem,
  TreeDataProvider,
  EventEmitter,
  Event,
  window,
} from 'vscode';
import { newDesign } from '../../commands/local-supergraph-designs';
import { SupergraphTreeItem } from './tree-items/local-supergraph-designs/supergraphTreeItem';
import { SubgraphSummaryTreeItem } from './tree-items/local-supergraph-designs/subgraphSummaryTreeItem';
import { OperationSummaryTreeItem } from './tree-items/local-supergraph-designs/operationSummaryTreeItem';
import { AddDesignOperationTreeItem } from './tree-items/local-supergraph-designs/addDesignOperationTreeItem';
import { FederationVersionItem } from './tree-items/local-supergraph-designs/federationVersionItem';

export const media = (file: string) =>
  path.join(__dirname, '..', 'media', file);

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

      return this.items;
    } else {
      switch (element.contextValue) {
        case 'supergraphTreeItem': {
          const supergraphItem = element as SupergraphTreeItem;
          const federationIdentifierItem = new FederationVersionItem(
            supergraphItem.wbFilePath,
            supergraphItem.wbFile.federation_version,
          );
          const treeItems: any[] = [
            federationIdentifierItem,
            supergraphItem.subgraphsChild,
          ];
          if (
            supergraphItem.wbFile.operations &&
            Object.keys(supergraphItem.wbFile.operations).length > 0
          ) {
            treeItems.push(supergraphItem.operationsChild);
          } else {
            treeItems.push(
              new AddDesignOperationTreeItem(supergraphItem.wbFilePath),
            );
          }

          return treeItems;
        }
        case 'subgraphSummaryTreeItem':
          return (
            (element as SubgraphSummaryTreeItem).subgraphs
          );
        case 'operationSummaryTreeItem':
          return (element as OperationSummaryTreeItem).operations;
        default:
          return [];
      }
    }
  }
}
