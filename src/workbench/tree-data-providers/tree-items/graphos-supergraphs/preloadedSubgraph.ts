import { TreeItem, TreeItemCollapsibleState, Uri, workspace } from 'vscode';
import { FileProvider } from '../../../file-system/fileProvider';
import { media } from '../../superGraphTreeDataProvider';
import { resolve } from 'path';

export class PreloadedSubgraph extends TreeItem {
  constructor(
    public readonly subgraphName: string,
    public readonly wbFileName: string,
    public readonly wbFilePath: string,
  ) {
    super(subgraphName, TreeItemCollapsibleState.None);

    this.tooltip = this.subgraphName;
    this.iconPath = {
      light: media('graphql-logo.png'),
      dark: media('graphql-logo.png'),
    };
    this.contextValue = 'preloadedSubgraph';
    this.command = {
      command: 'preloaded.viewPreloadedSchema',
      title: 'View Schema',
      arguments: [this],
    };
  }

  async getSchema() {
    const schemaFilePath = resolve(
      this.wbFilePath,
      this.wbFileName,
      `${this.subgraphName}.graphql`,
    );
    const schema = await workspace.fs.readFile(Uri.parse(schemaFilePath));
    const result = schema.toString();
    return result;
  }
}
