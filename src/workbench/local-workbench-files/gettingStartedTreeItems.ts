import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { FileProvider } from "../../utils/files/fileProvider";
import { Uri } from 'vscode';
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