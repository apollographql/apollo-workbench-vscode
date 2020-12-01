import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileProvider } from '../../utils/files/fileProvider';
import { PreloadedWorkbenchTopLevel } from '../studio-graphs/preLoadedTreeItems';
import { StateManager } from '../stateManager';
import { NotLoggedInTreeItem } from '../studio-graphs/apolloStudioGraphsTreeDataProvider';
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

    getFilesInDirectory(dirPath: string): Array<WorkbenchFile> {
        let workbenchFiles = new Array<{ name: string, path: string }>();
        let directories = new Array<string>();
        directories.push(dirPath);

        while (directories.length > 0) {
            let directory = directories[0];
            const dirents = fs.readdirSync(directory, { withFileTypes: true });
            for (const dirent of dirents) {
                const directoryPath = path.resolve(directory, dirent.name);
                if (dirent.isDirectory()) {
                    directories.push(directoryPath);
                } else if (dirent.name.includes('apollo-workbench')) {
                    workbenchFiles.push({ name: dirent.name, path: directoryPath })
                }
            }

            directories.splice(0, 1);
        }

        return workbenchFiles;
    }

    getChildren(element?: WorkbenchFileTreeItem): Thenable<vscode.TreeItem[]> {
        if (element == undefined) {
            if (!this.workspaceRoot || this.workspaceRoot == '.') return Promise.resolve([new GettingStartedTopLevel(vscode.TreeItemCollapsibleState.Expanded)]);

            let items = new Array<vscode.TreeItem>();
            if (element) {
                //I think this is for re-use
            } else {
                let workbenchFiles = this.getFilesInDirectory(this.workspaceRoot);
                workbenchFiles.forEach(workbenchFile => {
                    let index = workbenchFile.name.indexOf(wbExt);
                    items.push(new WorkbenchFileTreeItem(workbenchFile.name.slice(0, index), workbenchFile.path));
                })
            }

            if (items.length == 0) {
                vscode.window.showInformationMessage("No workspace files found in current directory", "Create New Workbench").then((value) => {
                    if (value === "Create New Workbench")
                        FileProvider.instance.promptToCreateWorkbenchFile();
                });
                items.push(new GettingStartedTopLevel(vscode.TreeItemCollapsibleState.Expanded) as vscode.TreeItem);
            }
            else
                items.push(new GettingStartedTopLevel() as vscode.TreeItem);

            return Promise.resolve(items);
        } else {
            return Promise.resolve(element.children);
        }
    }
}

const wbExt = '.apollo-workbench';
export class WorkbenchFileTreeItem extends vscode.TreeItem {
    children: vscode.TreeItem[] = new Array<vscode.TreeItem>();

    constructor(
        public readonly workbenchFileName: string,
        public readonly filePath: string
    ) {
        super(workbenchFileName, vscode.TreeItemCollapsibleState.None);

        if (this.workbenchFileName.includes(wbExt)) {
            let index = this.workbenchFileName.indexOf(wbExt);
            let tooltip = this.workbenchFileName.slice(0, index);
            this.tooltip = tooltip
        } else
            this.tooltip = this.workbenchFileName;

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
