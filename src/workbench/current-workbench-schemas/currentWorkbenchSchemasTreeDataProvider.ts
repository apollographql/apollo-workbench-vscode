import * as path from 'path';
import * as vscode from 'vscode';
import { FileProvider } from '../../utils/files/fileProvider';

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
        if (!this.workspaceRoot || this.workspaceRoot == '.') return Promise.resolve([]);

        if (element) {

        } else {
            let items = this.getSchemasFromWorkbenchFile();
            if (items.length == 0)
                items.push(new WorkbenchSchemaTreeItem("No schemas in workbench file yet", "", vscode.TreeItemCollapsibleState.None));
            else if (FileProvider.instance?.currrentWorkbench?.composedSchema) items.splice(0, 0, new WorkbenchCsdlTreeItem());

            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }

    private getSchemasFromWorkbenchFile(): vscode.TreeItem[] {
        const schemas = FileProvider.instance.currrentWorkbenchSchemas;
        if (Object.keys(schemas).length != 0) {
            const toDep = (serviceName: string, wbSchema: { sdl: string }): WorkbenchSchemaTreeItem => {
                return new WorkbenchSchemaTreeItem(
                    serviceName,
                    wbSchema.sdl,
                    vscode.TreeItemCollapsibleState.None
                );
            };

            const deps = schemas ? Object.keys(schemas).map(serviceName => toDep(serviceName, schemas[serviceName])) : [];

            return deps;
        } else {
            return [new vscode.TreeItem("No workbench file selected", vscode.TreeItemCollapsibleState.None)];
        }
    }
}

export class WorkbenchCsdlTreeItem extends vscode.TreeItem {
    constructor() {
        super('Latest Composed Schema', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: "current-workbench-schemas.viewCsdl",
            title: "View Latest Composed Schema"
        };
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
