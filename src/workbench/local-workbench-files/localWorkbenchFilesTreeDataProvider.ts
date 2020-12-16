import * as vscode from 'vscode';
import * as path from 'path';
import { FileProvider } from '../../utils/files/fileProvider';
import { StateManager } from '../stateManager';
import { GettingStartedTopLevel } from './gettingStartedTreeItems';

export interface WorkbenchFile {
    name: string,
    path: string
}

export class LocalWorkbenchFilesTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private workspaceRoot: string) { }

    private _onDidChangeTreeData: vscode.EventEmitter<WorkbenchFileTreeItem | undefined> = new vscode.EventEmitter<WorkbenchFileTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<WorkbenchFileTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchFileTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchFileTreeItem): Thenable<vscode.TreeItem[]> {
        if (element == undefined) {
            if (!this.workspaceRoot || this.workspaceRoot == '.') return Promise.resolve([new GettingStartedTopLevel(vscode.TreeItemCollapsibleState.Expanded)]);

            let items = new Array<vscode.TreeItem>();
            let workbenchFiles = FileProvider.instance.refreshLocalWorkbenchFiles();

            workbenchFiles.forEach((wbFile, wbFilePath) => {
                items.push(new WorkbenchFileTreeItem(wbFile.graphName, wbFilePath));
            })

            if (items.length == 0) {
                vscode.window.showInformationMessage("No workspace files found in current directory", "Create New Workbench").then((value) => {
                    if (value === "Create New Workbench")
                        FileProvider.instance.promptToCreateWorkbenchFile();
                });
                if (StateManager.settings_displayExampleGraphs)
                    items.push(new GettingStartedTopLevel(vscode.TreeItemCollapsibleState.Expanded) as vscode.TreeItem);
            }
            else if (StateManager.settings_displayExampleGraphs)
                items.push(new GettingStartedTopLevel() as vscode.TreeItem);

            return Promise.resolve(items);
        } else {
            return Promise.resolve(element.children);
        }
    }
}

export class WorkbenchFileTreeItem extends vscode.TreeItem {
    children: vscode.TreeItem[] = new Array<vscode.TreeItem>();

    constructor(
        public readonly graphName: string,
        public readonly filePath: string
    ) {
        super(graphName, vscode.TreeItemCollapsibleState.None);

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
