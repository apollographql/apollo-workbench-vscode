import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { FileProvider } from "../../utils/files/fileProvider";

export class PreloadedWorkbenchTopLevel extends TreeItem {
    children: PreloadedWorkbenchFile[] = new Array<PreloadedWorkbenchFile>();

    constructor() {
        super("Example Graphs", TreeItemCollapsibleState.Collapsed);

        let preloadedFiles = FileProvider.instance.getPreloadedWorkbenchFiles();
        preloadedFiles.map(preloadedFile => {
            this.children.push(new PreloadedWorkbenchFile(preloadedFile.fileName));
        })
    }

    getChildren(element?: PreloadedWorkbenchTopLevel): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class PreloadedWorkbenchFile extends TreeItem {

    constructor(
        public readonly fileName: string
    ) {
        super(fileName, TreeItemCollapsibleState.None);

        this.contextValue = 'preloadedWorkbenchFile';
    }
}