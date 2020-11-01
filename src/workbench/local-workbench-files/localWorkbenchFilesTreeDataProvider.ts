import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApolloWorkbench } from '../../extension';

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
            if (!this.workspaceRoot) {
                vscode.window.showInformationMessage('No workbench file found in workspace');
                return Promise.resolve([]);
            }
            let items = new Array<WorkbenchFileTreeItem>();
            if (element) {
                //I think this is for re-use
            } else {
                let workbenchFiles = this.getFilesInDirectory(this.workspaceRoot);
                workbenchFiles.forEach(workbenchFile => {
                    let index = workbenchFile.name.indexOf(wbExt);
                    items.push(new WorkbenchFileTreeItem(workbenchFile.name.slice(0, index), workbenchFile.path));
                })
            }

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
        public readonly label: string,
        public readonly filePath: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        let wbFileRaw = fs.readFileSync(filePath, { encoding: 'utf8' });
        let wb: ApolloWorkbench = JSON.parse(wbFileRaw);

        if (this.label.includes(wbExt)) {
            let index = this.label.indexOf(wbExt);
            let tooltip = this.label.slice(0, index);
            this.tooltip = tooltip
        } else
            this.tooltip = this.label;

        let keys = Object.keys(wb.schemas) ?? 0;
        this.description = `${keys.length}S`;

        keys.forEach(key => {
            let item = new vscode.TreeItem(key, vscode.TreeItemCollapsibleState.None);
            let iconPath = path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png');
            item.iconPath = iconPath;
            this.children.push(item);
        });

        this.command = {
            command: "local-workbench-files.loadFile",
            title: "Load Workbench File",
            arguments: [this]
        };
    }

    iconPath = {
        light: path.join(__filename, '..', '..', '..', 'media', 'w.svg'),
        dark: path.join(__filename, '..', '..', '..', 'media', 'w.svg')
    };
}
