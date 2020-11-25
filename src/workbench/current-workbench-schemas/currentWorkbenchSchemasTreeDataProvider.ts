import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileWatchManager } from '../fileWatchManager';
import { WorkbenchSchema } from '../../extension';
import { WorkbenchFileManager } from '../workbenchFileManager';

export class CurrentWorkbenchSchemasTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(private workspaceRoot: string) { }

    private _onDidChangeTreeData: vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined> = new vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<WorkbenchSchemaTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        fs.rmdirSync(WorkbenchFileManager.workbenchSchemasFolderPath(false), { recursive: true });
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchSchemaTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchSchemaTreeItem): Thenable<vscode.TreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workbench file found in workspace');
            return Promise.resolve([]);
        }

        if (element) {

        } else {
            let items = this.getSchemasFromWorkbenchFile();
            if (items.length == 0)
                items.push(new WorkbenchSchemaTreeItem("No schemas in workbench file yet", "", vscode.TreeItemCollapsibleState.None));

            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }

    private getSchemasFromWorkbenchFile(): vscode.TreeItem[] {
        const workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let workbenchSchemasFolder = WorkbenchFileManager.workbenchSchemasFolderPath();

            const toDep = (serviceName: string, wbSchema: WorkbenchSchema): WorkbenchSchemaTreeItem => {
                if (!this.pathExists(`${workbenchSchemasFolder}/${serviceName}.graphql`))
                    fs.writeFileSync(`${workbenchSchemasFolder}/${serviceName}.graphql`, wbSchema.sdl);

                return new WorkbenchSchemaTreeItem(
                    serviceName,
                    wbSchema.sdl,
                    vscode.TreeItemCollapsibleState.None
                );
            };

            const deps = workbenchFile.schemas
                ? Object.keys(workbenchFile.schemas).map(serviceName => toDep(serviceName, workbenchFile.schemas[serviceName])) : [];

            return deps;
        } else {
            return [new vscode.TreeItem("No workbench file selected", vscode.TreeItemCollapsibleState.None)];
        }
    }

    private pathExists(p: string): boolean {
        try {
            fs.accessSync(p);
        } catch (err) {
            return false;
        }
        return true;
    }
}

export class WorkbenchSchemaTreeItem extends vscode.TreeItem {
    constructor(
        public readonly serviceName: string,
        public readonly schema: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(serviceName, collapsibleState);
        this.tooltip = this.serviceName;

        if (!this.serviceName.includes('No schemas'))
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
            };

        this.command = {
            command: "current-workbench-schemas.editSchema",
            title: "Edit Schema File",
            arguments: [this]
        };

        this.contextValue = 'workbenchSchemaTreeItem';
    }
}
