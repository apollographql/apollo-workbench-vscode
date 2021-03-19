import * as path from 'path';
import { FileProvider } from '../file-system/fileProvider';
import { StateManager } from '../stateManager';
import { TreeItem, TreeItemCollapsibleState, TreeDataProvider, EventEmitter, Event, window } from "vscode";
import { Uri } from 'vscode';

export interface WorkbenchFile {
    name: string,
    path: string
}

export class LocalWorkbenchFilesTreeDataProvider implements TreeDataProvider<TreeItem> {
    constructor(private workspaceRoot: string) { }

    private _onDidChangeTreeData: EventEmitter<WorkbenchFileTreeItem | undefined> = new EventEmitter<WorkbenchFileTreeItem | undefined>();
    readonly onDidChangeTreeData: Event<WorkbenchFileTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchFileTreeItem): TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchFileTreeItem): Thenable<TreeItem[]> {
        if (element == undefined) {
            if (!this.workspaceRoot || this.workspaceRoot == '.') return Promise.resolve([new GettingStartedTopLevel(TreeItemCollapsibleState.Expanded)]);

            let items = new Array<TreeItem>();
            let workbenchFiles = FileProvider.instance.refreshLocalWorkbenchFiles();

            workbenchFiles.forEach((wbFile, wbFilePath) => {
                items.push(new WorkbenchFileTreeItem(wbFile.graphName, wbFilePath));
            })

            if (items.length == 0) {
                window.showInformationMessage("No workspace files found in current directory", "Create New Workbench").then((value) => {
                    if (value === "Create New Workbench")
                        FileProvider.instance.promptToCreateWorkbenchFile();
                });
                if (StateManager.settings_displayExampleGraphs)
                    items.push(new GettingStartedTopLevel(TreeItemCollapsibleState.Expanded) as TreeItem);
            }
            else if (StateManager.settings_displayExampleGraphs)
                items.push(new GettingStartedTopLevel() as TreeItem);

            return Promise.resolve(items);
        } else {
            return Promise.resolve(element.children);
        }
    }
}

export class WorkbenchFileTreeItem extends TreeItem {
    children: TreeItem[] = new Array<TreeItem>();

    constructor(
        public readonly graphName: string,
        public readonly filePath: string
    ) {
        super(graphName, TreeItemCollapsibleState.None);

        this.tooltip = this.graphName;

        this.command = {
            command: "local-workbench-files.loadFile",
            title: "Load Workbench File",
            arguments: [this]
        };
        this.contextValue = 'workbenchFileTreeItem';
    }

    iconPath = {
        light: path.join(__filename, '..', '..', '..', 'media', 'w.svg'),
        dark: path.join(__filename, '..', '..', '..', 'media', 'w.svg')
    };
}

export class GettingStartedTopLevel extends TreeItem {
    children: TreeItem[] = new Array<TreeItem>();

    constructor(state: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed) {
        super("Getting Started", state);

        this.children.push(new GettingStartedTreeItem(1, "Creating a workbench file"));
        this.children.push(new GettingStartedTreeItem(2, "Adding a schema file"));
        this.children.push(new GettingStartedTreeItem(3, "Define your first Entity"));
        this.children.push(new GettingStartedTreeItem(4, "Write your first Query"));
        this.children.push(new GettingStartedTreeItem(5, "View the query plan"));
        this.children.push(new GettingStartedTreeItem(6, "View your fully composed schema"));
        this.children.push(new GettingStartedAppendixGroupTreeItem());
    }

    getChildren(element?: GettingStartedTopLevel): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class GettingStartedTreeItem extends TreeItem {
    uri: Uri;
    constructor(
        public readonly classifier: number,
        public readonly fileName: string
    ) {
        super(`${classifier}. ${fileName}`, TreeItemCollapsibleState.None);
        this.uri = Uri.parse(`getting-started:${classifier}.md`);
        this.contextValue = 'gettingStarted';

        this.command = {
            title: `Getting Started - ${classifier}`,
            command: "extension.gettingStarted",
            arguments: [this]
        };
    }
}
class GettingStartedAppendixGroupTreeItem extends TreeItem {
    children: GettingStartedAppendixTreeItem[] = new Array<GettingStartedAppendixTreeItem>();
    constructor() {
        super("Appendix", TreeItemCollapsibleState.Collapsed);
        this.children.push(new GettingStartedAppendixTreeItem("Composition errors", 'composition-errors'));
        this.children.push(new GettingStartedAppendixTreeItem("Starting mocked servers", 'starting-mocks'));
        this.children.push(new GettingStartedAppendixTreeItem("Stopping mocked servers", 'stopping-mocks'));
        this.children.push(new GettingStartedAppendixTreeItem("Using Intellisense", 'using-intellisense'));
    }
    getChildren(): Thenable<TreeItem[]> {
        return new Promise(() => this.children);
    }
}
export class GettingStartedAppendixTreeItem extends TreeItem {
    uri: Uri;
    constructor(
        public readonly title: string,
        public readonly fileName: string
    ) {
        super(title, TreeItemCollapsibleState.None);
        this.uri = Uri.parse(`getting-started:${fileName}.md`);
        this.contextValue = 'gettingStarted';

        this.command = {
            title: `Getting Started - ${title}`,
            command: "extension.gettingStarted",
            arguments: [this]
        };
    }
}