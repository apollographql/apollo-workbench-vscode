import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { FileProvider } from '../../../file-system/fileProvider';
import { PreloadedSubgraph } from './preloadedSubgraph';

export class PreloadedWorkbenchFile extends TreeItem {
  children: PreloadedSubgraph[] = new Array<PreloadedSubgraph>();

  constructor(
    public readonly fileName: string,
    public readonly filePath: string,
  ) {
    super(fileName, TreeItemCollapsibleState.Expanded);

    this.contextValue = 'preloadedWorkbenchFile';
    this.getChildren();
  }
  async getChildren(element?: PreloadedWorkbenchFile): Promise<TreeItem[]> {
    const wbFile = await FileProvider.instance.getPreloadedWorkbenchFile(
      this.filePath,
    );
    Object.keys(wbFile.subgraphs).forEach((s) =>
      this.children.push(
        new PreloadedSubgraph(s, this.fileName, this.filePath),
      ),
    );

    return this.children;
  }
}
