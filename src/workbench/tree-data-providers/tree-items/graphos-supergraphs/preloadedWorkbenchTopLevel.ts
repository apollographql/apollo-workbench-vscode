import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { PreloadedWorkbenchFile } from './preloadedWorkbenchFile';
import { FileProvider } from '../../../file-system/fileProvider';

export class PreloadedWorkbenchTopLevel extends TreeItem {
  children: PreloadedWorkbenchFile[] = new Array<PreloadedWorkbenchFile>();

  constructor() {
    super('Example Designs', TreeItemCollapsibleState.Collapsed);
    this.getChildren();
  }

  async getChildren(element?: PreloadedWorkbenchTopLevel): Promise<TreeItem[]> {
    const preloadedFiles =
      await FileProvider.instance?.getPreloadedWorkbenchFiles();
    preloadedFiles.map((preloadedFile) => {
      this.children.push(
        new PreloadedWorkbenchFile(preloadedFile.fileName, preloadedFile.path),
      );
    });
    return this.children;
  }
}
