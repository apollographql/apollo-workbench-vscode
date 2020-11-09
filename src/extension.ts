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
import { StateManager } from './workbench/stateManager';
import { getGraphSchemasByVariant } from './studio-gql/graphClient';
import { GetGraphSchemas_service_implementingServices_FederatedImplementingServices } from './studio-gql/types/GetGraphSchemas';

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

export async function activate(context: vscode.ExtensionContext) {
	const ensureFolderIsOpenommand = vscode.commands.registerCommand('extension.ensureFolderIsOpen', async () => {
		if (!vscode.workspace.rootPath) {
			let openFolder = "Open Folder";
			let response = await vscode.window.showErrorMessage("You must open a folder to use Apollo Workbench. We'll need a place to store a .workbench folder that holds schema/query files.", openFolder);
			if (response == openFolder)
				await vscode.commands.executeCommand('extension.openFolder');
		} else {
			setupApolloWorkbench(context);
		}
	});
	const openCodeFolderCommand = vscode.commands.registerCommand('extension.openFolder', async () => {
		let folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folder)
			await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
	});
	context.subscriptions.push(openCodeFolderCommand);
	context.subscriptions.push(ensureFolderIsOpenommand);
	vscode.commands.executeCommand('extension.ensureFolderIsOpen');
}

function setupApolloWorkbench(context: vscode.ExtensionContext) {
	// const localWorkbenchFilesProvider = new LocalWorkbenchFilesTreeDataProvider(vscode.workspace.rootPath ?? ".");
	// const currentWorkbenchSchemasProvider = new CurrentWorkbenchSchemasTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	// const currentWorkbenchOperationsProvider = new CurrentWorkbenchOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	// const apolloStudioGraphsProvider = new ApolloStudioGraphsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	// const apolloStudioGraphOpsProvider = new ApolloStudioGraphOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	context.subscriptions.push(compositionDiagnostics);

	fileWatchManager.extensionContext = context;
	StateManager.context = context;
	StateManager.localWorkbenchFilesProvider = new LocalWorkbenchFilesTreeDataProvider(vscode.workspace.rootPath ?? ".");
	StateManager.currentWorkbenchSchemasProvider = new CurrentWorkbenchSchemasTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.currentWorkbenchOperationsProvider = new CurrentWorkbenchOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.apolloStudioGraphsProvider = new ApolloStudioGraphsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);
	StateManager.apolloStudioGraphOpsProvider = new ApolloStudioGraphOpsTreeDataProvider(vscode.workspace.rootPath ?? ".", context);

	//Global Extension Commands
	const newWorkbenchCommand = vscode.commands.registerCommand('extension.newWorkbench', async () => { newWorkbench(StateManager.localWorkbenchFilesProvider) });
	const startWorkbenchCommand = vscode.commands.registerCommand('extension.startWorkbench', async () => await fileWatchManager.start());
	const stopWorkbenchCommand = vscode.commands.registerCommand('extension.stopWorkbench', async () => await fileWatchManager.stop())
	const enterStudioApiKeyCommand = vscode.commands.registerCommand('extension.enterStudioApiKey', async () => {
		let apiKey = await vscode.window.showInputBox({ placeHolder: "Enter User API Key - user:gh.michael-watson:023jr324tj...." })
		if (apiKey) {
			context.globalState.update('APOLLO_KEY', apiKey);
			StateManager.apolloStudioGraphsProvider.refresh();
		}
	})
	vscode.commands.registerCommand('extension.deleteStudioApiKey', () => {
		context.globalState.update('APOLLO_KEY', "");
		context.globalState.update('APOLLO_SELCTED_ACCOUNT', "");
		StateManager.apolloStudioGraphsProvider.refresh();
		StateManager.apolloStudioGraphOpsProvider.refresh();
	});

	context.subscriptions.push(newWorkbenchCommand);
	context.subscriptions.push(startWorkbenchCommand);
	context.subscriptions.push(stopWorkbenchCommand);
	context.subscriptions.push(enterStudioApiKeyCommand);

	//Current Loaded Workbench Schemas Commands
	vscode.window.registerTreeDataProvider('current-workbench-schemas', StateManager.currentWorkbenchSchemasProvider);
	vscode.commands.registerCommand('current-workbench-schemas.addSchema', async () => await createSchemaFile(context, StateManager.currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand("current-workbench-schemas.editSchema", editSchema);
	vscode.commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => await deleteSchemaFile(serviceToDelete.serviceName, context, StateManager.currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => StateManager.currentWorkbenchSchemasProvider.refresh());


	//Current Loaded Workbench Operations Commands
	vscode.window.registerTreeDataProvider('current-workbench-operations', StateManager.currentWorkbenchOperationsProvider);
	vscode.commands.registerCommand('current-workbench-operations.addOperation', async () => await fileWatchManager.createOperation(context));
	vscode.commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await fileWatchManager.editOperation(operation.operationName));
	vscode.commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => fileWatchManager.deleteOperation(operation.operationName));
	vscode.commands.registerCommand('current-workbench-operations.refreshOperations', async () => StateManager.currentWorkbenchOperationsProvider.refresh());
	vscode.commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => {
		outputChannel.appendLine(`Opening query plan for operation ${op.operationName}`);
		const workbenchQueriesFolder = workspaceQueriesFolderPath();
		const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${op.operationName}.queryplan`);
		await vscode.window.showTextDocument(uri);
	});

	//Local Workbench Files Commands
	vscode.window.registerTreeDataProvider('local-workbench-files', StateManager.localWorkbenchFilesProvider);
	vscode.commands.registerCommand("local-workbench-files.loadFile", (item: WorkbenchFileTreeItem) => {
		outputChannel.appendLine(`Loading WB:${item.graphVariant} - ${item.filePath}`);
		context.workspaceState.update("selectedWbFile", { name: item.graphVariant, path: item.filePath } as WorkbenchFile);
		StateManager.currentWorkbenchSchemasProvider.refresh();
		StateManager.currentWorkbenchOperationsProvider.refresh();
	});
	vscode.commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await fileWatchManager.deleteWorkbenchFile(item.filePath));
	vscode.commands.registerCommand('local-workbench-files.refresh', async () => StateManager.localWorkbenchFilesProvider.refresh());


	//Apollo Studio Graphs Commands
	vscode.window.registerTreeDataProvider('studio-graphs', StateManager.apolloStudioGraphsProvider);
	vscode.commands.registerCommand('studio-graphs.refresh', () => StateManager.apolloStudioGraphsProvider.refresh());
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
			StateManager.localWorkbenchFilesProvider.refresh();
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
		StateManager.localWorkbenchFilesProvider.refresh();
	});
	vscode.commands.registerCommand('studio-graphs.addServiceSchemaToCurrentWorkbench', async (graphVariantServiceTreeItem: StudioGraphVariantServiceTreeItem) => {
		let workbenchFile = getSelectedWorkbenchFile(context);
		if (workbenchFile) {
			writeLocalSchemaToFile(graphVariantServiceTreeItem.name, graphVariantServiceTreeItem.sdl);
			workbenchFile.schemas[graphVariantServiceTreeItem.name] = graphVariantServiceTreeItem.sdl;
			saveWorkbenchFile(workbenchFile);
			StateManager.currentWorkbenchSchemasProvider.refresh();
		} else
			vscode.window.showErrorMessage("There is no workbench file currently selected to add this schema to. Please select a local workbench file and then try again,");
	});
	vscode.commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: StudioGraphTreeItem) => {
		context.globalState.update("APOLLO_SELCTED_GRAPH_ID", graphTreeItem.graphId);
		StateManager.apolloStudioGraphOpsProvider.refresh();
	});
	vscode.commands.registerCommand('studio-graphs.switchOrg', async () => StateManager.setAccountId());

	//Apollo Studio Graph Operations Commands
	vscode.window.registerTreeDataProvider('studio-operations', StateManager.apolloStudioGraphOpsProvider);
	vscode.commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => {
		await fileWatchManager.createOperation(context, op.operationName, op.operationSignature)
	});


	// vscode.commands.registerCommand('test', async (item: StudioGraphVariantTreeItem) => {
	// 	let apiKey = StateManager.context.globalState.get("APOLLO_KEY") as string;
	// 	let graphVariantServiceTreeItems = new Array<StudioGraphVariantServiceTreeItem>();

	// 	//Query Studio for graph by variant
	// 	let variantServices = await getGraphSchemasByVariant(apiKey, item.graphId, item.graphVariant);
	// 	let implementingServices = variantServices.service?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;

	// 	if (implementingServices) {
	// 		//Loop through implemnting services and add to return objects
	// 		for (var l = 0; l < implementingServices.services.length; l++) {
	// 			let implemntingService = implementingServices.services[l];
	// 			graphVariantServiceTreeItems.push(new StudioGraphVariantServiceTreeItem(item.graphId, item.graphVariant, implemntingService.name, implemntingService.activePartialSchema.sdl));
	// 		}
	// 	}
	// 	else {
	// 		let schema = variantServices.service?.schema?.document;
	// 		graphVariantServiceTreeItems.push(new StudioGraphVariantServiceTreeItem(item.graphId, item.graphVariant, 'monolith-schema', schema));
	// 	}
	// 	// Set the implementing service tree items on the return objects
	// 	item.children = graphVariantServiceTreeItems;

	// 	item.getChildren();
	// });
}