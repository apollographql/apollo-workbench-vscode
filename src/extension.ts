import * as vscode from 'vscode';
const chokidar = require('chokidar');

import { newWorkbench } from './workbench/new';

import { loadFile } from './workbench/local-workbench-files/loadFile';
import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFile, WorkbenchFileTreeItem } from './workbench/local-workbench-files/localWorkbenchFilesTreeDataProvider';

import { createSchemaFile } from './workbench/current-workbench-schemas/createSchemaFile';
import { editSchema } from './workbench/current-workbench-schemas/editSchema';
import { CurrentWorkbenchSchemasTreeDataProvider, WorkbenchSchemaTreeItem } from './workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { FileWatchManager } from './workbench/fileWatchManager';
import { CurrentWorkbenchOpsTreeDataProvider, WorkbenchOperationTreeItem } from './workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider';
import { ApolloStudioGraphsTreeDataProvider, StudioGraphTreeItem, StudioGraphVariantServiceTreeItem, StudioGraphVariantTreeItem } from './workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';
import { getSelectedWorkbenchFile, saveWorkbenchFile, workspaceQueriesFolderPath, writeLocalSchemaToFile } from './helpers';
import { deleteSchemaFile } from './workbench/current-workbench-schemas/deleteSchemaFile';
import { ApolloStudioGraphOpsTreeDataProvider, StudioOperationTreeItem } from './workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider';

export class ApolloWorkbench {
	graphName: string = "";
	operations: { [key: string]: string } = {};
	queryPlans: { [key: string]: string } = {};
	schemas: { [key: string]: string } = {};
	composedSchema: string = "";
}

export const fileWatchManager = new FileWatchManager();
export const compositionDiagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("composition-errors");
export const outputChannel = vscode.window.createOutputChannel("Apollo Workbench");
console.log = function (str) { //Redirect console.log to Output tab in extension
	outputChannel.appendLine(str);
};

// Our event when vscode deactivates
export function deactivate(context: vscode.ExtensionContext): undefined {
	console.log("Deactivated Extension");

	return undefined;
}

export function activate(context: vscode.ExtensionContext) {
	const localWorkbenchFilesProvider = new LocalWorkbenchFilesTreeDataProvider(vscode.workspace.rootPath ?? ".");
	const currentWorkbenchSchemasProvider = new CurrentWorkbenchSchemasTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	const currentWorkbenchOperationsProvider = new CurrentWorkbenchOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	const apolloStudioGraphsProvider = new ApolloStudioGraphsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	const apolloStudioGraphOpsProvider = new ApolloStudioGraphOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	context.subscriptions.push(compositionDiagnostics);

	fileWatchManager.extensionContext = context;
	fileWatchManager.localWorkbenchFilesProvider = localWorkbenchFilesProvider;
	fileWatchManager.currentWorkbenchSchemasProvider = currentWorkbenchSchemasProvider;
	fileWatchManager.currentWorkbenchOperationsProvider = currentWorkbenchOperationsProvider;
	fileWatchManager.apolloStudioGraphsProvider = apolloStudioGraphsProvider;
	fileWatchManager.apolloStudioGraphOpsProvider = apolloStudioGraphOpsProvider;

	//Global Extension Commands
	const newWorkbenchCommand = vscode.commands.registerCommand('extension.newWorkbench', async () => { newWorkbench(localWorkbenchFilesProvider) });
	const startWorkbenchCommand = vscode.commands.registerCommand('extension.startWorkbench', async () => await fileWatchManager.start());
	const stopWorkbenchCommand = vscode.commands.registerCommand('extension.stopWorkbench', async () => await fileWatchManager.stop())
	const enterStudioApiKeyCommand = vscode.commands.registerCommand('extension.enterStudioApiKey', async () => {
		let apiKey = await vscode.window.showInputBox({ placeHolder: "Enter User API Key - user:gh.michael-watson:023jr324tj...." })
		if (apiKey) {
			context.globalState.update('APOLLO_KEY', apiKey);
			apolloStudioGraphsProvider.refresh();
		}
	})
	vscode.commands.registerCommand('extension.deleteStudioApiKey', () => {
		context.globalState.update('APOLLO_KEY', "");
		context.globalState.update('APOLLO_SELCTED_ACCOUNT', "");
		apolloStudioGraphsProvider.refresh();
		apolloStudioGraphOpsProvider.refresh();
	});

	context.subscriptions.push(newWorkbenchCommand);
	context.subscriptions.push(startWorkbenchCommand);
	context.subscriptions.push(stopWorkbenchCommand);
	context.subscriptions.push(enterStudioApiKeyCommand);

	//Current Loaded Workbench Schemas Commands
	vscode.window.registerTreeDataProvider('current-workbench-schemas', currentWorkbenchSchemasProvider);
	vscode.commands.registerCommand('current-workbench-schemas.addSchema', async () => await createSchemaFile(context, currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand("current-workbench-schemas.editSchema", editSchema);
	vscode.commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => await deleteSchemaFile(serviceToDelete.serviceName, context, currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => currentWorkbenchSchemasProvider.refresh());


	//Current Loaded Workbench Operations Commands
	vscode.window.registerTreeDataProvider('current-workbench-operations', currentWorkbenchOperationsProvider);
	vscode.commands.registerCommand('current-workbench-operations.addOperation', async () => await fileWatchManager.createOperation(context));
	vscode.commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await fileWatchManager.editOperation(operation.operationName));
	vscode.commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => fileWatchManager.deleteOperation(operation.operationName));
	vscode.commands.registerCommand('current-workbench-operations.refreshOperations', async () => currentWorkbenchOperationsProvider.refresh());
	vscode.commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => {
		outputChannel.appendLine(`Opening query plan for operation ${op.operationName}`);
		const workbenchQueriesFolder = workspaceQueriesFolderPath();
		const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${op.operationName}.queryplan`);
		await vscode.window.showTextDocument(uri);
	});

	//Local Workbench Files Commands
	vscode.window.registerTreeDataProvider('local-workbench-files', localWorkbenchFilesProvider);
	vscode.commands.registerCommand("local-workbench-files.loadFile", (item: WorkbenchFileTreeItem) => {
		outputChannel.appendLine(`Loading WB:${item.graphVariant} - ${item.filePath}`);
		context.workspaceState.update("selectedWbFile", { name: item.graphVariant, path: item.filePath } as WorkbenchFile);
		currentWorkbenchSchemasProvider.refresh();
		currentWorkbenchOperationsProvider.refresh();
	});
	vscode.commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await fileWatchManager.deleteWorkbenchFile(item.filePath));
	vscode.commands.registerCommand('local-workbench-files.refresh', async () => localWorkbenchFilesProvider.refresh());


	//Apollo Studio Graphs Commands
	vscode.window.registerTreeDataProvider('studio-graphs', apolloStudioGraphsProvider);
	vscode.commands.registerCommand('studio-graphs.refresh', () => apolloStudioGraphsProvider.refresh());
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraph', async (graphTreeItem: StudioGraphTreeItem) => {
		let graphVariants: string[] = new Array<string>();
		let graphVariantTreeItems: { [key: string]: StudioGraphVariantTreeItem } = {};
		graphTreeItem.children.map(graphVariant => {
			let variantName = graphVariant.graphVariant;
			graphVariants.push(variantName);
			graphVariantTreeItems[variantName] = graphVariant;
		});

		let selectedVariant = await vscode.window.showQuickPick(graphVariants);
		if (selectedVariant) {
			let defaultGraphName = `${graphTreeItem.graphId}@${selectedVariant}-${Date.now().toString()}`;
			let graphName = await vscode.window.showInputBox({
				prompt: "Enter a name for your new workbench file",
				placeHolder: defaultGraphName,
				value: defaultGraphName
			});
			outputChannel.appendLine(`Creating workbench file ${graphName} from ${defaultGraphName}`);
			let workbenchFile: ApolloWorkbench = new ApolloWorkbench();
			workbenchFile.graphName = graphName ?? defaultGraphName;

			let selectedVariantTreeItem = graphVariantTreeItems[selectedVariant];
			selectedVariantTreeItem.children.map(selectedVariantServiceTreeItem => {
				let serviceName = selectedVariantServiceTreeItem.name;
				let schema = selectedVariantServiceTreeItem.sdl;
				workbenchFile.schemas[serviceName] = schema;
			});

			saveWorkbenchFile(workbenchFile);
			localWorkbenchFilesProvider.refresh();
		}
	});
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', async (graphVariantTreeItem: StudioGraphVariantTreeItem) => {
		let workbenchFile: ApolloWorkbench = new ApolloWorkbench();
		let selectedVariant = graphVariantTreeItem.graphVariant;
		let defaultGraphName = `${graphVariantTreeItem.graphId}@${selectedVariant}-${Date.now().toString()}`;
		let graphName = await vscode.window.showInputBox({
			prompt: "Enter a name for your new workbench file",
			placeHolder: defaultGraphName,
			value: defaultGraphName
		});
		outputChannel.appendLine(`Creating workbench file ${graphName} from ${defaultGraphName}`);

		workbenchFile.graphName = graphName ?? defaultGraphName;
		graphVariantTreeItem.children.map(service => {
			workbenchFile.schemas[service.name] = service.sdl;
		});

		saveWorkbenchFile(workbenchFile);
		localWorkbenchFilesProvider.refresh();
	});
	vscode.commands.registerCommand('studio-graphs.addServiceSchemaToCurrentWorkbench', async (graphVariantServiceTreeItem: StudioGraphVariantServiceTreeItem) => {
		let workbenchFile = getSelectedWorkbenchFile(context);
		if (workbenchFile) {
			writeLocalSchemaToFile(graphVariantServiceTreeItem.name, graphVariantServiceTreeItem.sdl);
			workbenchFile.schemas[graphVariantServiceTreeItem.name] = graphVariantServiceTreeItem.sdl;
			saveWorkbenchFile(workbenchFile);
			currentWorkbenchSchemasProvider.refresh();
		} else
			vscode.window.showErrorMessage("There is no workbench file currently selected to add this schema to. Please select a local workbench file and then try again,");
	});
	vscode.commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: StudioGraphTreeItem) => {
		context.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphTreeItem.graphId);
		apolloStudioGraphOpsProvider.refresh();
	});

	//Apollo Studio Graph Operations Commands
	vscode.window.registerTreeDataProvider('studio-operations', apolloStudioGraphOpsProvider);
	vscode.commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => {
		await fileWatchManager.createOperation(context, op.operationName, op.operationSignature)
	});
}