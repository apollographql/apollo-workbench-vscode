import * as path from 'path';
import * as vscode from 'vscode';
import { FileProvider } from '../file-system/fileProvider';

export class CurrentWorkbenchSchemasTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private workspaceRoot: string) { }

    private _onDidChangeTreeData: vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined> = new vscode.EventEmitter<WorkbenchSchemaTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<WorkbenchSchemaTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchSchemaTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchSchemaTreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            let items = this.getSchemasFromWorkbenchFile();
            if (items.length == 0)
                items.push(new WorkbenchSchemaTreeItem("No schemas in workbench file yet", "", vscode.TreeItemCollapsibleState.None));
            else if (FileProvider.instance?.currrentWorkbench?.composedSchema) items.splice(0, 0, new WorkbenchCsdlTreeItem());

            return Promise.resolve(items);
        }
    }

    private getSchemasFromWorkbenchFile(): vscode.TreeItem[] {
        const schemas = FileProvider.instance.currrentWorkbenchSchemas;
        if (schemas == undefined) {
            return [new vscode.TreeItem("No workbench file selected", vscode.TreeItemCollapsibleState.None)];
        } else if (Object.keys(schemas).length == 0) {
            return [new vscode.TreeItem("No schemas in selected workbench file", vscode.TreeItemCollapsibleState.None)];
        } else {
            const toDep = (serviceName: string, wbSchema: { sdl: string }): WorkbenchSchemaTreeItem => {
                return new WorkbenchSchemaTreeItem(
                    serviceName,
                    wbSchema.sdl,
                    vscode.TreeItemCollapsibleState.None
                );
            };

            return Object.keys(schemas).map(serviceName => toDep(serviceName, schemas[serviceName]));
        }
    }
}

export class WorkbenchCsdlTreeItem extends vscode.TreeItem {
    constructor() {
        super('Core Schema (CSDL)', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: "current-workbench-schemas.viewCsdl",
            title: "View Latest Core Schema"
        };
        this.contextValue = 'workbenchGraphSchemaTreeItem';
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
