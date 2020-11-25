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
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { PreloadedWorkbenchFile } from './workbench/studio-graphs/preLoadedTreeItems';
import { enterApiKey, setAccountId } from './utils/vscodeHelpers';

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
// console.log = function (str) { //Redirect console.log to Output tab in extension
// 	outputChannel.appendLine(str);
// };

// Our event when vscode deactivates
export async function deactivate(context: vscode.ExtensionContext) {
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

	StateManager.init(context);

	//Register Tree Data Providers
	vscode.window.registerTreeDataProvider('local-workbench-files', StateManager.instance.localWorkbenchFilesProvider);
	vscode.window.registerTreeDataProvider('current-workbench-schemas', StateManager.instance.currentWorkbenchSchemasProvider);
	vscode.window.registerTreeDataProvider('current-workbench-operations', StateManager.instance.currentWorkbenchOperationsProvider);
	vscode.window.registerTreeDataProvider('studio-graphs', StateManager.instance.apolloStudioGraphsProvider);
	vscode.window.registerTreeDataProvider('studio-operations', StateManager.instance.apolloStudioGraphOpsProvider);

	//Global Extension Commands
	vscode.commands.registerCommand('extension.newWorkbench', fileWatchManager.newWorkbenchFile);
	vscode.commands.registerCommand('extension.enterStudioApiKey', enterApiKey);
	vscode.commands.registerCommand('extension.deleteStudioApiKey', () => StateManager.instance.globalState_userApiKey = "");

	//Current Loaded Workbench Schemas Commands
	vscode.commands.registerCommand('current-workbench-schemas.addSchema', async () => await fileWatchManager.createSchema());
	vscode.commands.registerCommand("current-workbench-schemas.editSchema", editSchema);
	vscode.commands.registerCommand("current-workbench-schemas.renameSchema", async (serviceToRename: WorkbenchSchemaTreeItem) => await fileWatchManager.renameSchema(serviceToRename.serviceName));
	vscode.commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => await deleteSchemaFile(serviceToDelete.serviceName, context, StateManager.instance.currentWorkbenchSchemasProvider));
	vscode.commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => StateManager.instance.currentWorkbenchSchemasProvider.refresh());

	//Current Loaded Workbench Operations Commands
	vscode.commands.registerCommand('current-workbench-operations.addOperation', async () => await fileWatchManager.addOperation());
	vscode.commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await fileWatchManager.editOperation(operation.operationName));
	vscode.commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => fileWatchManager.deleteOperation(operation.operationName));
	vscode.commands.registerCommand('current-workbench-operations.refreshOperations', async () => StateManager.instance.currentWorkbenchOperationsProvider.refresh());
	vscode.commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => await fileWatchManager.openOperationQueryPlan(op.operationName));

	//Local Workbench Files Commands
	vscode.commands.registerCommand("local-workbench-files.loadFile", async (item: WorkbenchFileTreeItem) => await fileWatchManager.loadWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.duplicateFile", async (item: WorkbenchFileTreeItem) => await WorkbenchFileManager.duplicateWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await WorkbenchFileManager.deleteWorkbenchFile(item.filePath));
	vscode.commands.registerCommand('local-workbench-files.refresh', async () => StateManager.instance.localWorkbenchFilesProvider.refresh());

	//Apollo Studio Graphs Commands
	vscode.commands.registerCommand('studio-graphs.refresh', () => StateManager.instance.apolloStudioGraphsProvider.refresh());
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraph', async (graphTreeItem: StudioGraphTreeItem) => await fileWatchManager.newWorkbenchFileFromGraph(graphTreeItem.graphId, graphTreeItem.variants));
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromPreloaded', async (preloadedItem: PreloadedWorkbenchFile) => await WorkbenchFileManager.copyPreloadedWorkbenchFile(preloadedItem.fileName));
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', async (graphVariantTreeItem: StudioGraphVariantTreeItem) => await fileWatchManager.newWorkbenchFileFromGraph(graphVariantTreeItem.graphId, [graphVariantTreeItem.graphVariant]));
	vscode.commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: StudioGraphTreeItem) => StateManager.instance.globalState_selectedGraph = graphTreeItem.graphId);
	vscode.commands.registerCommand('studio-graphs.switchOrg', setAccountId);

	//Apollo Studio Graph Operations Commands
	vscode.commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => { await fileWatchManager.addOperation(op.operationName, op.operationSignature) });

	vscode.languages.registerCompletionItemProvider("graphql", federationCompletionProvider);
	vscode.languages.registerCodeActionsProvider({ language: 'graphql' }, new FederationCodeActionprovider());

	vscode.commands.registerCommand('current-workbench-schemas.deleteSchemaDocTextRange', async (document: vscode.TextDocument, range: vscode.Range) => {
		vscode.window.visibleTextEditors.forEach(async editor => {
			if (editor.document == document) {
				await editor.edit(edit => edit.delete(range));
				await editor.document.save();
				await vscode.window.showTextDocument(editor.document);
			}
		})
	});
	vscode.commands.registerCommand('current-workbench-schemas.makeSchemaDocTextRangeArray', async (document: vscode.TextDocument, range: vscode.Range) => {
		vscode.window.visibleTextEditors.forEach(async editor => {
			if (editor.document == document) {
				let lineNumber = range.start.line;
				let line = editor.document.lineAt(lineNumber);
				let lineTextSplit = line.text.split(':')[1].trim();
				let arrayCharacter = lineTextSplit.indexOf('[');
				let type = lineTextSplit.slice(0, arrayCharacter);
				let originalArrayCharacterIndex = line.text.indexOf('[');

				await editor.edit(edit => {
					let replaceRange = new vscode.Range(lineNumber, originalArrayCharacterIndex - type.length, lineNumber, originalArrayCharacterIndex + lineTextSplit.length - arrayCharacter);
					edit.replace(replaceRange, `[${type}]`)
				});

				await editor.document.save();
				await vscode.window.showTextDocument(editor.document);
			}
		})
	});
}

export class FederationCodeActionprovider implements vscode.CodeActionProvider {
	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
		let code = context.diagnostics[0]?.code as string;
		let selectors: vscode.CodeAction[] = [];
		if (code.includes('makeArray')) {
			let line = document.lineAt(range.start.line);
			let trimmedText = line.text.trim();
			if (trimmedText != '[' && trimmedText != '[]' && trimmedText != '[ ]') {
				let selector = new vscode.CodeAction("Make array", vscode.CodeActionKind.QuickFix);
				selector.command = {
					command: "current-workbench-schemas.makeSchemaDocTextRangeArray",
					title: "Make into array",
					arguments: [document, range]
				};

				selectors.push(selector);
			}
		}
		if (code.includes('deleteRange')) {
			let selector = new vscode.CodeAction("Delete this selection", vscode.CodeActionKind.QuickFix);
			selector.command = {
				command: "current-workbench-schemas.deleteSchemaDocTextRange",
				title: "Delete this selection",
				arguments: [document, range]
			};

			selectors.push(selector);
		}

		if (selectors.length > 0)
			return selectors;
	}
}
