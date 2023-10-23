import { TreeItem, TreeItemCollapsibleState, Uri, workspace } from 'vscode';
import { FileProvider } from '../../../file-system/fileProvider';
import { media } from '../../superGraphTreeDataProvider';

export class PreloadedSubgraph extends TreeItem {
  constructor(
    public readonly subgraphName: string,
    public readonly filePath: string,
  ) {
    super(subgraphName, TreeItemCollapsibleState.None);

    this.tooltip = this.subgraphName;
    this.iconPath = {
      light: media('graphql-logo.png'),
      dark: media('graphql-logo.png'),
    };
    this.contextValue = 'preloadedSubgraph';
  }

  async getSchema() {
    const wbFile = await FileProvider.instance.getPreloadedWorkbenchFile(
      this.filePath,
    );
    const schemaFilePath =
      wbFile.subgraphs[this.subgraphName].schema.workbench_design;
    if (schemaFilePath) {
      const schema = await workspace.fs.readFile(Uri.parse(schemaFilePath));
      return schema.toString();
    }

    return '';
  }
}
