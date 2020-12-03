import * as vscode from 'vscode';

import { WorkbenchFileTreeItem } from './workbench/local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { StudioOperationTreeItem } from './workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider';
import { WorkbenchOperationTreeItem } from './workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider';
import { WorkbenchSchemaTreeItem } from './workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { StudioGraphTreeItem, StudioGraphVariantTreeItem } from './workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';

import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { PreloadedWorkbenchFile } from './workbench/studio-graphs/preLoadedTreeItems';
import { enterApiKey, setAccountId } from './utils/vscodeHelpers';
import { FileProvider, WorkbenchUri, WorkbenchUriType } from './utils/files/fileProvider';
import { GettingStartedTreeItem } from './workbench/local-workbench-files/gettingStartedTreeItems';
import { GettingStartedDocProvider } from './workbench/gettingStartedDocProvider';
import { ApolloConfig, schemaProviderFromConfig } from 'apollo-language-server';

export const compositionDiagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("composition-errors");
export const outputChannel = vscode.window.createOutputChannel("Apollo Workbench");
console.log = function (str) { //Redirect console.log to Output tab in extension
	outputChannel.appendLine(str);
};

// Our event when vscode deactivates
export async function deactivate(context: vscode.ExtensionContext) {
	ServerManager.instance.stopMocks();
}

export async function activate(context: vscode.ExtensionContext) {
	context.workspaceState.update("selectedWbFile", "");
	context.globalState.update("APOLLO_SELCTED_GRAPH_ID", "");

	context.subscriptions.push(compositionDiagnostics);

	StateManager.init(context);

	//Register commands to ensure a folder is open in the window to store workbench files
	vscode.commands.executeCommand('extension.ensureFolderIsOpen');
	vscode.commands.registerCommand('extension.ensureFolderIsOpen', async () => {
		if (!vscode.workspace.rootPath) {
			let openFolder = "Open Folder";
			let response = await vscode.window.showErrorMessage("You must open a folder to use Apollo Workbench. We'll need a place to store a .workbench folder that holds schema/query files.", openFolder);
			if (response == openFolder)
				await vscode.commands.executeCommand('extension.openFolder');
		}
	});
	vscode.commands.registerCommand('extension.openFolder', async () => {
		let folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folder)
			await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
	});

	//Register Tree Data Providers
	vscode.window.registerTreeDataProvider('local-workbench-files', StateManager.instance.localWorkbenchFilesProvider);
	vscode.window.registerTreeDataProvider('current-workbench-schemas', StateManager.instance.currentWorkbenchSchemasProvider);
	vscode.window.registerTreeDataProvider('current-workbench-operations', StateManager.instance.currentWorkbenchOperationsProvider);
	vscode.window.registerTreeDataProvider('studio-graphs', StateManager.instance.apolloStudioGraphsProvider);
	vscode.window.registerTreeDataProvider('studio-operations', StateManager.instance.apolloStudioGraphOpsProvider);

	//Global Extension Commands
	vscode.commands.registerCommand('extension.newWorkbench', FileProvider.instance.promptToCreateWorkbenchFile);
	vscode.commands.registerCommand('extension.enterStudioApiKey', enterApiKey);
	vscode.commands.registerCommand('extension.deleteStudioApiKey', () => StateManager.instance.globalState_userApiKey = "");
	vscode.commands.registerCommand('extension.startMocks', () => ServerManager.instance.startMocks());
	vscode.commands.registerCommand('extension.stopMocks', () => ServerManager.instance.stopMocks());
	vscode.commands.registerCommand('extension.gettingStarted', async (item: GettingStartedTreeItem) => {
		// vscode.commands.executeCommand('markdown.openPreview', item.uri);
		// console.log('test');
		vscode.window.showTextDocument(item.uri)
			.then(() => vscode.commands.executeCommand('markdown.showPreviewToSide'))
			.then(() => vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups'))
			.then(() => { }, (e) => console.error(e));
	});
	vscode.workspace.registerTextDocumentContentProvider('getting-started', new GettingStartedDocProvider());

	//Current Loaded Workbench Schemas Commands
	vscode.commands.registerCommand('current-workbench-schemas.addSchema', async () => await FileProvider.instance.promptToAddSchema());
	vscode.commands.registerCommand("current-workbench-schemas.editSchema", async (item: WorkbenchSchemaTreeItem) => FileProvider.instance.openSchema(item.serviceName));
	vscode.commands.registerCommand("current-workbench-schemas.renameSchema", async (serviceToRename: WorkbenchSchemaTreeItem) => await FileProvider.instance.renameSchema(serviceToRename.serviceName));
	vscode.commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => FileProvider.instance.delete(WorkbenchUri.parse(serviceToDelete.serviceName), { recursive: true }));
	vscode.commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => StateManager.instance.currentWorkbenchSchemasProvider.refresh());
	vscode.commands.registerCommand('current-workbench-schemas.viewCsdl', async () => vscode.window.showTextDocument(WorkbenchUri.csdl()));

	//Current Loaded Workbench Operations Commands
	vscode.commands.registerCommand('current-workbench-operations.addOperation', FileProvider.instance.promptToAddOperation);
	vscode.commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await FileProvider.instance.openOperation(operation.operationName));
	vscode.commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => FileProvider.instance.delete(WorkbenchUri.parse(operation.operationName, WorkbenchUriType.QUERIES), { recursive: true }));
	vscode.commands.registerCommand('current-workbench-operations.refreshOperations', async () => StateManager.instance.currentWorkbenchOperationsProvider.refresh());
	vscode.commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => await FileProvider.instance.openOperationQueryPlan(op.operationName));

	vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.scheme == 'workbench') {
			console.log(e);
			// let test = getAutocompleteSuggestions();
		}
	})

	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('workbench', FileProvider.instance, { isCaseSensitive: true }));

	//Local Workbench Files Commands
	vscode.commands.registerCommand("local-workbench-files.loadFile", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.loadWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.duplicateFile", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.duplicateWorkbenchFile(item.workbenchFileName, item.filePath));
	vscode.commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.promptToDeleteWorkbenchFile(item.filePath));
	vscode.commands.registerCommand('local-workbench-files.refresh', async () => StateManager.instance.localWorkbenchFilesProvider.refresh());

	//Apollo Studio Graphs Commands
	vscode.commands.registerCommand('studio-graphs.refresh', () => StateManager.instance.apolloStudioGraphsProvider.refresh());
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraph', async (graphTreeItem: StudioGraphTreeItem) => await FileProvider.instance.promptToCreateWorkbenchFileFromGraph(graphTreeItem.graphId, graphTreeItem.variants));
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromPreloaded', async (preloadedItem: PreloadedWorkbenchFile) => await FileProvider.instance.copyPreloadedWorkbenchFile(preloadedItem.fileName));
	vscode.commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', async (graphVariantTreeItem: StudioGraphVariantTreeItem) => await FileProvider.instance.promptToCreateWorkbenchFileFromGraph(graphVariantTreeItem.graphId, [graphVariantTreeItem.graphVariant]));
	vscode.commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: StudioGraphTreeItem) => StateManager.instance.globalState_selectedGraph = graphTreeItem.graphId);
	vscode.commands.registerCommand('studio-graphs.switchOrg', setAccountId);

	//Apollo Studio Graph Operations Commands
	vscode.commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => { await FileProvider.instance.addOperation(op.operationName, op.operationSignature) });

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
	let queriesFolder = WorkbenchUri.parse('*', WorkbenchUriType.QUERIES).fsPath;
	let schemasFolder = WorkbenchUri.parse('*').path;
	console.log(queriesFolder);
	let config = new ApolloConfig({ service: { localSchemaFile: WorkbenchUri.csdl().path, includes: [queriesFolder], excludes: [schemasFolder] } })
	let provider = schemaProviderFromConfig(config);
	provider.onSchemaChange(h => {
		console.log(h);
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
