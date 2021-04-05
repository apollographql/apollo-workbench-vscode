import * as path from 'path';
import { FileProvider } from '../file-system/fileProvider';
import { TreeItem, TreeItemCollapsibleState, TreeDataProvider, EventEmitter, Event, window, Uri, ThemeIcon } from "vscode";
import { ApolloWorkbenchFile, WorkbenchSchema } from '../file-system/fileTypes';
import { newDesign } from '../../commands/local-supergraph-designs';
import { StateManager } from '../stateManager';

export class LocalSupergraphTreeDataProvider implements TreeDataProvider<TreeItem> {
    constructor() { }

    private _onDidChangeTreeData: EventEmitter<undefined> = new EventEmitter<undefined>();
    readonly onDidChangeTreeData: Event<undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: SupergraphTreeItem): TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (element == undefined) {
            let items = new Array<TreeItem>();
            const workbenchFiles = FileProvider.instance.refreshLocalWorkbenchFiles();
            workbenchFiles.forEach((wbFile, wbFilePath) => items.push(new SupergraphTreeItem(wbFile, wbFilePath)));

            if (items.length == 0) {
                window.showInformationMessage("No workspace files found in current directory", "Create New Workbench").then((value) => {
                    if (value === "Create New Workbench")
                        newDesign();
                });
                if (StateManager.settings_displayExampleGraphs)
                    items.push(new GettingStartedTopLevel(TreeItemCollapsibleState.Expanded) as TreeItem);
            }
            else if (StateManager.settings_displayExampleGraphs)
                items.push(new GettingStartedTopLevel() as TreeItem);

            return Promise.resolve(items);
        } else {
            switch (element.contextValue) {
                case 'supergraphTreeItem':
                    const supergraphItem = element as SupergraphTreeItem;
                    let subgraphItem = element as SupergraphTreeItem;

                    //Support legacy composition in workbench files
                    if ((supergraphItem.wbFile as any)?.composedSchema)
                        subgraphItem.wbFile.supergraphSdl = (supergraphItem.wbFile as any)?.composedSchema;

                    if (subgraphItem.wbFile.supergraphSdl) {
                        return Promise.resolve([
                            new SupergraphSchemaTreeItem(supergraphItem.wbFile, supergraphItem.filePath),
                            new SupergraphApiSchemaTreeItem(supergraphItem.wbFile, supergraphItem.filePath),
                            supergraphItem.subgraphsChild,
                            supergraphItem.operationsChild]
                        );
                    } else {
                        let invalidCompositionItem = new TreeItem("INVALID COMPOSITION", TreeItemCollapsibleState.None);
                        invalidCompositionItem.iconPath = new ThemeIcon('notebook-state-error');
                        return Promise.resolve([invalidCompositionItem, subgraphItem.subgraphsChild, subgraphItem.operationsChild]);
                    }
                case 'subgraphSummaryTreeItem':
                    return Promise.resolve((element as SubgraphSummaryTreeItem).subgraphs);
                case 'operationSummaryTreeItem':
                    return Promise.resolve((element as OperationSummaryTreeItem).operations);
                case 'gettingStartedTopLevel':
                    return Promise.resolve((element as GettingStartedTopLevel).children);
                default:
                    return Promise.resolve([]);
            }
        }
    }
}

export class SupergraphTreeItem extends TreeItem {
    subgraphsChild: SubgraphSummaryTreeItem;
    operationsChild: OperationSummaryTreeItem;

    constructor(
        public readonly wbFile: ApolloWorkbenchFile,
        public readonly filePath: string
    ) {
        super(wbFile.graphName, TreeItemCollapsibleState.Collapsed);
        this.subgraphsChild = new SubgraphSummaryTreeItem(wbFile, filePath);
        this.operationsChild = new OperationSummaryTreeItem(wbFile, filePath);
        this.tooltip = this.wbFile.graphName;

        this.contextValue = 'supergraphTreeItem';
    }
}
export class SupergraphSchemaTreeItem extends TreeItem {
    constructor(
        public readonly wbFile: ApolloWorkbenchFile,
        public readonly filePath: string
    ) {
        super("Supergraph Schema", TreeItemCollapsibleState.None);
        this.contextValue = 'supergraphSchemaTreeItem';
        this.command = {
            command: "local-supergraph-designs.viewSupergraphSchema",
            title: "View Supergraph Schema",
            arguments: [this]
        };
        this.iconPath = path.join(__filename, '..', '..', '..', '..', 'media', 'supergraph.svg');
    }
}
export class SupergraphApiSchemaTreeItem extends TreeItem {
    constructor(
        public readonly wbFile: ApolloWorkbenchFile,
        public readonly filePath: string
    ) {
        super("API Schema", TreeItemCollapsibleState.None);
        this.contextValue = 'supergraphApiSchemaTreeItem';
        this.command = {
            command: "local-supergraph-designs.viewSupergraphApiSchema",
            title: "View API Schema for Supergraph",
            arguments: [this]
        };
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
            dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
        };
    }
}
export class SubgraphSummaryTreeItem extends TreeItem {
    subgraphs: TreeItem[] = new Array<TreeItem>();

    constructor(
        public readonly wbFile: ApolloWorkbenchFile,
        public readonly filePath: string
    ) {
        super(`${Object.keys(wbFile.schemas).length} subgraphs`, TreeItemCollapsibleState.Expanded);

        this.tooltip = `${Object.keys(wbFile.schemas).length} Subgraphs`;
        this.contextValue = 'subgraphSummaryTreeItem';

        Object.keys(wbFile.schemas).forEach(subgraphName => {
            this.subgraphs.push(new SubgraphTreeItem(subgraphName, wbFile.schemas[subgraphName], filePath))
        })
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'media', 'subgraph.svg'),
            dark: path.join(__filename, '..', '..', '..', '..', 'media', 'subgraph.svg')
        };
    }

}
export class SubgraphTreeItem extends TreeItem {
    children: TreeItem[] = new Array<TreeItem>();

    constructor(
        public readonly subgraphName: string,
        public readonly wbSchema: WorkbenchSchema,
        public readonly wbFilePath: string
    ) {
        super(subgraphName, TreeItemCollapsibleState.None);

        this.contextValue = 'subgraphTreeItem';
        this.tooltip = this.subgraphName;
        this.command = {
            command: "local-supergraph-designs.editSubgraph",
            title: "Edit Schema",
            arguments: [this]
        };
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png'),
            dark: path.join(__filename, '..', '..', '..', '..', 'media', 'graphql-logo.png')
        };
    }
}
export class OperationSummaryTreeItem extends TreeItem {
    operations: TreeItem[] = new Array<TreeItem>();

    constructor(
        public readonly wbFile: ApolloWorkbenchFile,
        public readonly filePath: string
    ) {
        super(`${Object.keys(wbFile.operations).length} Operations`, TreeItemCollapsibleState.Collapsed);

        this.tooltip = `${Object.keys(wbFile.operations).length} operations`;
        this.contextValue = 'operationSummaryTreeItem';

        Object.keys(wbFile.operations).forEach(operationName => {
            this.operations.push(new OperationTreeItem(operationName, wbFile.operations[operationName], filePath))
        })
    }
}
export class OperationTreeItem extends TreeItem {
    children: TreeItem[] = new Array<TreeItem>();

    constructor(
        public readonly operationName: string,
        public readonly operationString: string,
        public readonly filePath: string
    ) {
        super(operationName, TreeItemCollapsibleState.None);

        this.contextValue = 'operationTreeItem';
        this.tooltip = this.operationName;
        this.command = {
            command: "local-supergraph-designs.editOperation",
            title: "Edit Operation",
            arguments: [this]
        };

        if (this.operationString.includes('mutation'))
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg')
            };
        else
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg')
            };
    }
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
        this.contextValue = `gettingStartedTopLevel`;
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