import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkbenchFile } from '../local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { getWorkbenchFile, workspaceSchemasFolder } from '../../helpers';

export class CurrentWorkbenchTreeDataProvider implements vscode.TreeDataProvider<WorkbenchSchemaTreeItem> {
    context: vscode.ExtensionContext;

    constructor(private workspaceRoot: string, context: vscode.ExtensionContext) {
        this.context = context;
    }
    private _onDidChangeTreeData: vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined> = new vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<WorkbenchSchemaTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        fs.rmdirSync(workspaceSchemasFolder(false), { recursive: true });
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchSchemaTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchSchemaTreeItem): Thenable<WorkbenchSchemaTreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workbench file found in workspace');
            return Promise.resolve([]);
        }

        let wbFile = this.context.workspaceState.get("selectedWbFile") as WorkbenchFile;

        if (element) {
            return Promise.resolve(
                this.getSchemasFromWorkbenchFile(
                    path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')
                )
            );
        } else if (!wbFile) {
            console.log(`No workbench file currently selected.`);
            return Promise.resolve([]);
        } else {
            if (this.pathExists(wbFile.path)) {
                let items = this.getSchemasFromWorkbenchFile(wbFile.path);
                if (items.length == 0)
                    items.push(new WorkbenchSchemaTreeItem("No schemas in workbench file yet", "", vscode.TreeItemCollapsibleState.None));

                vscode.window.showInformationMessage(`Workbench file ${wbFile.name} was loaded`);

                return Promise.resolve(items);
            } else {
                vscode.window.showInformationMessage('Workspace has no workbench file');
                return Promise.resolve([]);
            }
        }
    }

    private getSchemasFromWorkbenchFile(workspaceFilePath: string): WorkbenchSchemaTreeItem[] {
        if (this.pathExists(workspaceFilePath)) {
            const workbenchFile = getWorkbenchFile(workspaceFilePath);

            let workbenchSchemasFolder = workspaceSchemasFolder();

            const toDep = (serviceName: string, schema: string): WorkbenchSchemaTreeItem => {
                if (!this.pathExists(`${workbenchSchemasFolder}/${serviceName}.graphql`))
                    fs.writeFileSync(`${workbenchSchemasFolder}/${serviceName}.graphql`, schema);

                return new WorkbenchSchemaTreeItem(
                    serviceName,
                    schema,
                    vscode.TreeItemCollapsibleState.None
                );
            };

            const deps = workbenchFile.schemas
                ? Object.keys(workbenchFile.schemas).map(serviceName => toDep(serviceName, workbenchFile.schemas[serviceName])) : [];

            return deps;
        } else {
            return [];
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
        public readonly label: string,
        public readonly schema: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;

        if (!this.label.includes('No schemas'))
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
            };

        this.command = {
            command: "current-workbench.editSchema",
            title: "Edit Schema File",
            arguments: [this]
        };

        this.contextValue = 'workbenchSchemaTreeItem';
    }
}
