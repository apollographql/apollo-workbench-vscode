import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { getFileName } from '../../../../utils/path';
import { SubgraphSummaryTreeItem } from './subgraphSummaryTreeItem';
import { OperationSummaryTreeItem } from './operationSummaryTreeItem';
import { ApolloConfig } from '../../../file-system/ApolloConfig';

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
