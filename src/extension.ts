import * as vscode from 'vscode';

//TODO: Migrate legacy functions into Managers
import { editSchema } from './workbench/current-workbench-schemas/editSchema';
import { deleteSchemaFile } from './workbench/current-workbench-schemas/deleteSchemaFile';

import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFileTreeItem } from './workbench/local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { ApolloStudioGraphOpsTreeDataProvider, StudioOperationTreeItem } from './workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider';
import { CurrentWorkbenchOpsTreeDataProvider, WorkbenchOperationTreeItem } from './workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider';
import { CurrentWorkbenchSchemasTreeDataProvider, WorkbenchSchemaTreeItem } from './workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { ApolloStudioGraphsTreeDataProvider, StudioGraphTreeItem, StudioGraphVariantTreeItem } from './workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';
import { FileWatchManager } from './workbench/fileWatchManager';

import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { WorkbenchFileManager } from './workbench/workbenchFileManager';

export class ApolloWorkbench {
	graphName: string = "";
	operations: { [opName: string]: string } = {};
	queryPlans: { [opName: string]: string } = {};
	schemas: { [serviceName: string]: WorkbenchSchema } = {};
	composedSchema: string = "";
}

export class WorkbenchSchema {
	url?: string = "";
	sdl: string = "";
	shouldMock: boolean = true;
	constructor(sdl?: string) {
		this.sdl = sdl ?? "";
	}
}

export const fileWatchManager = new FileWatchManager();
export const compositionDiagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("composition-errors");
export const outputChannel = vscode.window.createOutputChannel("Apollo Workbench");
console.log = function (str) { //Redirect console.log to Output tab in extension
	outputChannel.appendLine(str);
};

// Our event when vscode deactivates
export async function deactivate(context: vscode.ExtensionContext) {
	StateManager.context = context;
	ServerManager.instance.stopMocks();
	await fileWatchManager.stop();
}

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand('extension.ensureFolderIsOpen', async () => {
		if (!vscode.workspace.rootPath) {
			let openFolder = "Open Folder";
			let response = await vscode.window.showErrorMessage("You must open a folder to use Apollo Workbench. We'll need a place to store a .workbench folder that holds schema/query files.", openFolder);
			if (response == openFolder)
				await vscode.commands.executeCommand('extension.openFolder');
		} else {
			setupApolloWorkbench(context);
		}
	});
	vscode.commands.registerCommand('extension.openFolder', async () => {
		let folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folder)
			await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
	});

	vscode.commands.executeCommand('extension.ensureFolderIsOpen');
}

function setupApolloWorkbench(context: vscode.ExtensionContext) {
	context.workspaceState.update("selectedWbFile", "");
	context.globalState.update("APOLLO_SELCTED_GRAPH_ID", "");

	context.subscriptions.push(compositionDiagnostics);

	StateManager.context = context;
	StateManager.localWorkbenchFilesProvider = new LocalWorkbenchFilesTreeDataProvider(vscode.workspace.rootPath ?? ".");
	StateManager.currentWorkbenchSchemasProvider = new CurrentWorkbenchSchemasTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.currentWorkbenchOperationsProvider = new CurrentWorkbenchOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.apolloStudioGraphsProvider = new ApolloStudioGraphsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.apolloStudioGraphOpsProvider = new ApolloStudioGraphOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);

	//Register Tree Data Providers
	vscode.window.registerTreeDataProvider('local-workbench-files', StateManager.localWorkbenchFilesProvider);
	vscode.window.registerTreeDataProvider('current-workbench-schemas', StateManager.currentWorkbenchSchemasProvider);
	vscode.window.registerTreeDataProvider('current-workbench-operations', StateManager.currentWorkbenchOperationsProvider);
	vscode.window.registerTreeDataProvider('studio-graphs', StateManager.apolloStudioGraphsProvider);
	vscode.window.registerTreeDataProvider('studio-operations', StateManager.apolloStudioGraphOpsProvider);

	//Global Extension Commands
	vscode.commands.registerCommand('extension.newWorkbench', fileWatchManager.newWorkbenchFile);
	vscode.commands.registerCommand('extension.enterStudioApiKey', StateManager.enterApiKey);
	vscode.commands.registerCommand('extension.deleteStudioApiKey', StateManager.delteApiKey);

	//Current Loaded Workbench Schemas Commands
	vscode.commands.registerCommand('current-workbench-schemas.addSchema', async () => await fileWatchManager.createSchema());
	vscode.commands.registerCommand("current-workbench-schemas.editSchema", editSchema);
	vscode.commands.registerCommand("current-workbench-schemas.renameSchema", async (serviceToRename: WorkbenchSchemaTreeItem) => await fileWatchManager.renameSchema(serviceToRename.serviceName));
	vscode.commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => await deleteSchemaFile(serviceToDelete.serviceName, context, StateManager.currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => StateManager.currentWorkbenchSchemasProvider.refresh());

	//Current Loaded Workbench Operations Commands
	vscode.commands.registerCommand('current-workbench-operations.addOperation', async () => await fileWatchManager.addOperation());
	vscode.commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await fileWatchManager.editOperation(operation.operationName));
	vscode.commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => fileWatchManager.deleteOperation(operation.operationName));
	vscode.commands.registerCommand('current-workbench-operations.refreshOperations', async () => StateManager.currentWorkbenchOperationsProvider.refresh());
	vscode.commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => await fileWatchManager.openOperationQueryPlan(op.operationName));

	//Local Workbench Files Commands
	vscode.commands.registerCommand("local-workbench-files.loadFile", async (item: WorkbenchFileTreeItem) => await fileWatchManager.loadWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.duplicateFile", async (item: WorkbenchFileTreeItem) => await WorkbenchFileManager.duplicateWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await WorkbenchFileManager.deleteWorkbenchFile(item.filePath));
	vscode.commands.registerCommand('local-workbench-files.refresh', async () => StateManager.localWorkbenchFilesProvider.refresh());

	//Apollo Studio Graphs Commands
	vscode.commands.registerCommand('studio-graphs.refresh', () => StateManager.apolloStudioGraphsProvider.refresh());
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraph', async (graphTreeItem: StudioGraphTreeItem) => await fileWatchManager.newWorkbenchFileFromGraph(graphTreeItem.graphId, graphTreeItem.variants));
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', async (graphVariantTreeItem: StudioGraphVariantTreeItem) => await fileWatchManager.newWorkbenchFileFromGraph(graphVariantTreeItem.graphId, [graphVariantTreeItem.graphVariant]));
	vscode.commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: StudioGraphTreeItem) => StateManager.setGraphId(graphTreeItem.graphId));
	vscode.commands.registerCommand('studio-graphs.switchOrg', StateManager.setAccountId);

	//Apollo Studio Graph Operations Commands
	vscode.commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => { await fileWatchManager.addOperation(op.operationName, op.operationSignature) });
}