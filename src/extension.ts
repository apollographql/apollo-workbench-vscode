import { workspace, commands, languages, window, ExtensionContext, Uri, DiagnosticCollection, ProgressLocation, TextDocument, Range, CodeActionKind, Diagnostic, Position, CodeAction, CodeActionProvider, CodeActionContext } from 'vscode';

import { WorkbenchFileTreeItem } from './workbench/local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { StudioOperationTreeItem } from './workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider';
import { WorkbenchOperationTreeItem } from './workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider';
import { WorkbenchSchemaTreeItem } from './workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { StudioGraphTreeItem, StudioGraphVariantTreeItem } from './workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';

import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { PreloadedWorkbenchFile } from './workbench/studio-graphs/preLoadedTreeItems';
import { enterApiKey, setAccountId, exportWorkbenchProject } from './utils/vscodeHelpers';
import { FileProvider, WorkbenchUri, WorkbenchUriType } from './utils/files/fileProvider';
import { GettingStartedTreeItem } from './workbench/local-workbench-files/gettingStartedTreeItems';
import { ApolloStudioOperationsProvider, GettingStartedDocProvider } from './workbench/docProviders';
import { buildSchema, Kind, parse, Source, TypeInfo, visit, visitWithTypeInfo } from 'graphql';
import { collectExecutableDefinitionDiagnositics } from 'apollo-language-server/lib/diagnostics';
import { GraphQLDocument } from 'apollo-language-server/lib/document';
import { defaultValidationRules } from 'apollo-language-server/lib/errors/validation';
import { DiagnosticSeverity } from 'vscode-languageclient';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const compositionDiagnostics: DiagnosticCollection = languages.createDiagnosticCollection("composition-errors");
export const operationDiagnostics: DiagnosticCollection = languages.createDiagnosticCollection("operation-errors");
export const outputChannel = window.createOutputChannel("Apollo Workbench");
//Redirect console.log to Output tab in extension
console.log = function (str) {
	outputChannel.appendLine(str);
};

// Our event when vscode deactivates
export async function deactivate(context: ExtensionContext) {
	ServerManager.instance.stopMocks();
}

export async function activate(context: ExtensionContext) {
	context.workspaceState.update("selectedWbFile", "");
	context.globalState.update("APOLLO_SELCTED_GRAPH_ID", "");

	context.subscriptions.push(compositionDiagnostics);

	StateManager.init(context);

	//Register commands to ensure a folder is open in the window to store workbench files
	commands.executeCommand('extension.ensureFolderIsOpen');
	commands.registerCommand('extension.ensureFolderIsOpen', async () => {
		if (!workspace.workspaceFolders || (workspace.workspaceFolders && !workspace.workspaceFolders[0])) {
			let openFolder = "Open Folder";
			let response = await window.showErrorMessage("You must open a folder to create Apollo Workbench files", openFolder);
			if (response == openFolder) await commands.executeCommand('extension.openFolder');
		}
	});
	commands.registerCommand('extension.openFolder', async () => {
		let folder = await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folder) await commands.executeCommand('openFolder', folder[0]);
	});

	//Register Tree Data Providers
	window.registerTreeDataProvider('local-workbench-files', StateManager.instance.localWorkbenchFilesProvider);
	window.registerTreeDataProvider('current-workbench-schemas', StateManager.instance.currentWorkbenchSchemasProvider);
	window.registerTreeDataProvider('current-workbench-operations', StateManager.instance.currentWorkbenchOperationsProvider);
	window.registerTreeDataProvider('studio-graphs', StateManager.instance.apolloStudioGraphsProvider);
	window.registerTreeDataProvider('studio-operations', StateManager.instance.apolloStudioGraphOpsProvider);

	//Global Extension Commands
	commands.registerCommand('extension.newWorkbench', async () => await FileProvider.instance.promptToCreateWorkbenchFile());
	commands.registerCommand('extension.enterStudioApiKey', enterApiKey);
	commands.registerCommand('extension.deleteStudioApiKey', () => StateManager.instance.globalState_userApiKey = "");
	commands.registerCommand('extension.startMocks', () => window.withProgress({ location: ProgressLocation.Notification, title: "Starting Mock Servers" }, async (progress, token) => {
		ServerManager.instance.startMocks();
		window.setStatusBarMessage('Apollo Workbench Mocks Running');
	}));
	commands.registerCommand('extension.stopMocks', () => window.withProgress({ location: ProgressLocation.Notification, title: "Stopping Mock Servers" }, async (progress, token) => {
		ServerManager.instance.stopMocks();
		window.setStatusBarMessage("");
	}));
	commands.registerCommand('extension.gettingStarted', async (item: GettingStartedTreeItem) => {
		window.showTextDocument(item.uri)
			.then(() => commands.executeCommand('markdown.showPreviewToSide'))
			.then(() => commands.executeCommand('workbench.action.closeEditorsInOtherGroups'))
			.then(() => { }, (e) => console.error(e));
	});
	workspace.registerTextDocumentContentProvider(GettingStartedDocProvider.scheme, new GettingStartedDocProvider());
	workspace.registerTextDocumentContentProvider(ApolloStudioOperationsProvider.scheme, new ApolloStudioOperationsProvider());

	//Current Loaded Workbench Schemas Commands
	commands.registerCommand('current-workbench-schemas.addSchema', async () => await FileProvider.instance.promptToAddSchema());
	commands.registerCommand("current-workbench-schemas.editSchema", async (item: WorkbenchSchemaTreeItem) => FileProvider.instance.openSchema(item.serviceName));
	commands.registerCommand("current-workbench-schemas.renameSchema", async (serviceToRename: WorkbenchSchemaTreeItem) => await FileProvider.instance.renameSchema(serviceToRename.serviceName));
	commands.registerCommand("current-workbench-schemas.deleteSchema", async (serviceToDelete: WorkbenchSchemaTreeItem) => FileProvider.instance.delete(WorkbenchUri.parse(serviceToDelete.serviceName), { recursive: true }));
	commands.registerCommand('current-workbench-schemas.refreshSchemas', async () => StateManager.instance.currentWorkbenchSchemasProvider.refresh());
	commands.registerCommand('current-workbench-schemas.viewCsdl', async () => window.showTextDocument(WorkbenchUri.csdl()));
	//Schema Mocking Commands
	commands.registerCommand('current-workbench-schemas.shouldMockSchema', async (service: WorkbenchSchemaTreeItem) => await FileProvider.instance.shouldMockSchema(service.serviceName));
	commands.registerCommand('current-workbench-schemas.disableMockSchema', (service: WorkbenchSchemaTreeItem) => FileProvider.instance.disableMockSchema(service.serviceName));
	commands.registerCommand('current-workbench-schemas.setUrlForService', async (service: WorkbenchSchemaTreeItem) => await FileProvider.instance.promptServiceUrl(service.serviceName));
	commands.registerCommand('current-workbench-schemas.updateSchemaFromUrl', async (service: WorkbenchSchemaTreeItem) => await FileProvider.instance.updateSchemaFromUrl(service.serviceName));
	commands.registerCommand('current-workbench-schemas.viewSettings', async (service: WorkbenchSchemaTreeItem) => await window.showTextDocument(WorkbenchUri.parse(service.serviceName, WorkbenchUriType.SCHEMAS_SETTINGS)));
	commands.registerCommand('current-workbench-schemas.viewCustomMocks', async (service: WorkbenchSchemaTreeItem) => {
		//TODO: cycle through open editors to see if mocks are already open to switch to tab

		//Get customMocks from workbench file
		const defaultMocks = "const faker = require('faker')\n\nconst mocks = {\n\tString: () => faker.lorem.word(),\n}\nmodule.exports = mocks;";
		let serviceName = service.serviceName;
		let serviceMocksUri = WorkbenchUri.parse(serviceName, WorkbenchUriType.MOCKS);
		let customMocks = FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks;
		if (customMocks) {
			//Sync it to local global storage file
			await workspace.fs.writeFile(serviceMocksUri, new Uint8Array(Buffer.from(customMocks)));
		} else {
			FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks = defaultMocks;
			FileProvider.instance.saveCurrentWorkbench();
			await workspace.fs.writeFile(serviceMocksUri, new Uint8Array(Buffer.from(defaultMocks)));
		}

		await window.showTextDocument(serviceMocksUri);
	});

	workspace.onDidSaveTextDocument(e => {
		let uri = e.uri;
		if (uri.fsPath.includes('mocks.js') && FileProvider.instance.currrentWorkbench) {
			let mocksText = e.getText();
			let serviceName = uri.fsPath.split('-mocks.js')[0].split('/mocks/')[1];

			FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks = mocksText;
			FileProvider.instance.saveCurrentWorkbench();
		}
	})

	//Current Loaded Workbench Operations Commands
	commands.registerCommand('current-workbench-operations.addOperation', async () => await FileProvider.instance.promptToAddOperation());
	commands.registerCommand("current-workbench-operations.editOperation", async (operation: WorkbenchOperationTreeItem) => await FileProvider.instance.openOperation(operation.operationName));
	commands.registerCommand("current-workbench-operations.deleteOperation", async (operation: WorkbenchOperationTreeItem) => FileProvider.instance.delete(WorkbenchUri.parse(operation.operationName, WorkbenchUriType.QUERIES), { recursive: true }));
	commands.registerCommand('current-workbench-operations.refreshOperations', async () => StateManager.instance.currentWorkbenchOperationsProvider.refresh());
	commands.registerCommand('current-workbench-operations.openQueryPlan', async (op: StudioOperationTreeItem) => await FileProvider.instance.openOperationQueryPlan(op.operationName));

	workspace.onDidChangeTextDocument(e => {
		let uri = e.document.uri;
		let document = new GraphQLDocument(new Source(e.document.getText()));
		if (uri.scheme == 'workbench') {
			if (uri.path.includes('queries')) {
				const schema = StateManager.instance.workspaceState_schema;
				if (schema) {
					const fragments = Object.create(null);
					if (document.ast) {
						for (const definition of document.ast.definitions) {
							if (definition.kind === Kind.FRAGMENT_DEFINITION) {
								fragments[definition.name.value] = definition;
							}
						}
					}
					let opDiagnostics = collectExecutableDefinitionDiagnositics(schema, document, fragments, defaultValidationRules);
					if (opDiagnostics.length > 0) {
						operationDiagnostics.clear();
						let diagnostics = new Array<Diagnostic>();
						opDiagnostics.forEach(opDiag => {
							let start = opDiag.range.start;
							let end = opDiag.range.end;
							let range = new Range(new Position(start.line, start.character), new Position(end.line, end.character));
							diagnostics.push(new Diagnostic(range, opDiag.message, opDiag.severity))
						});
						operationDiagnostics.set(uri, diagnostics);
					} else {
						operationDiagnostics.clear();
					}
				} else {
					operationDiagnostics.clear();
					operationDiagnostics.set(uri, [new Diagnostic(new Range(0, 0, 0, 0), "No valid composed schema", DiagnosticSeverity.Warning)]);
				}
			}
		}
	})

	context.subscriptions.push(workspace.registerFileSystemProvider('workbench', FileProvider.instance, { isCaseSensitive: true }));

	//Local Workbench Files Commands
	commands.registerCommand("local-workbench-files.loadFile", async (item: WorkbenchFileTreeItem) => window.withProgress({ location: ProgressLocation.Notification, title: 'Loading Workbench File', cancellable: false }, () => FileProvider.instance.loadWorkbenchFile(item.graphName, item.filePath)));
	commands.registerCommand("local-workbench-files.renameGraph", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.promptToRenameWorkbenchFile(item.graphName, item.filePath));
	commands.registerCommand("local-workbench-files.duplicateFile", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.duplicateWorkbenchFile(item.graphName, item.filePath));
	commands.registerCommand("local-workbench-files.deleteFile", async (item: WorkbenchFileTreeItem) => await FileProvider.instance.promptToDeleteWorkbenchFile(item.filePath));
	commands.registerCommand('local-workbench-files.refresh', async () => StateManager.instance.localWorkbenchFilesProvider.refresh());
	commands.registerCommand('local-workbench-files.exportProject', async (item: WorkbenchFileTreeItem) => exportWorkbenchProject(item.filePath));
	//TODO: released once propery tested
	// commands.registerCommand('local-workbench-files.dockerize', async (item: WorkbenchFileTreeItem) => DockerImageManager.create(item.filePath));

	//Apollo Studio Graphs Commands
	commands.registerCommand('studio-graphs.refresh', () => StateManager.instance.apolloStudioGraphsProvider.refresh());
	commands.registerCommand('studio-graphs.createWorkbenchFromGraph', async (graphTreeItem: StudioGraphTreeItem) => await FileProvider.instance.promptToCreateWorkbenchFileFromGraph(graphTreeItem.graphId, graphTreeItem.variants));
	commands.registerCommand('studio-graphs.createWorkbenchFromPreloaded', async (preloadedItem: PreloadedWorkbenchFile) => await FileProvider.instance.copyPreloadedWorkbenchFile(preloadedItem.fileName));
	commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', async (graphVariantTreeItem: StudioGraphVariantTreeItem) => await FileProvider.instance.promptToCreateWorkbenchFileFromGraph(graphVariantTreeItem.graphId, [graphVariantTreeItem.graphVariant]));
	commands.registerCommand('studio-graphs.loadOperations', async (graphTreeItem: any, graphVariant?: string) => StateManager.instance.setSelectedGraph(graphTreeItem.graphId, graphVariant));
	commands.registerCommand('studio-graphs.viewStudioOperation', async (operation: StudioOperationTreeItem) => await window.showTextDocument(ApolloStudioOperationsProvider.Uri(operation.operationName, operation.operationSignature)));
	commands.registerCommand('studio-graphs.switchOrg', setAccountId);

	//Apollo Studio Graph Operations Commands
	commands.registerCommand('studio-operations.addToWorkbench', async (op: StudioOperationTreeItem) => { await FileProvider.instance.addOperation(op.operationName, op.operationSignature) });

	languages.registerCompletionItemProvider("graphql", federationCompletionProvider);
	languages.registerCodeActionsProvider({ language: 'graphql' }, new FederationCodeActionprovider());

	commands.registerCommand('current-workbench-schemas.deleteSchemaDocTextRange', async (document: TextDocument, range: Range) => {
		window.visibleTextEditors.forEach(async editor => {
			if (editor.document == document) {
				await editor.edit(edit => edit.delete(range));
				await editor.document.save();
				await window.showTextDocument(editor.document);
			}
		})
	});
	commands.registerCommand('current-workbench-schemas.makeSchemaDocTextRangeArray', async (document: TextDocument, range: Range) => {
		window.visibleTextEditors.forEach(async editor => {
			if (editor.document == document) {
				let lineNumber = range.start.line;
				let line = editor.document.lineAt(lineNumber);
				let lineTextSplit = line.text.split(':')[1].trim();
				let arrayCharacter = lineTextSplit.indexOf('[');
				let type = lineTextSplit.slice(0, arrayCharacter);
				let originalArrayCharacterIndex = line.text.indexOf('[');

				await editor.edit(edit => {
					let replaceRange = new Range(lineNumber, originalArrayCharacterIndex - type.length, lineNumber, originalArrayCharacterIndex + lineTextSplit.length - arrayCharacter);
					edit.replace(replaceRange, `[${type}]`)
				});

				await editor.document.save();
				await window.showTextDocument(editor.document);
			}
		})
	});
}

export class FederationCodeActionprovider implements CodeActionProvider {
	public provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] | undefined {
		let code = context.diagnostics[0]?.code as string;
		let selectors: CodeAction[] = [];
		if (code.includes('makeArray')) {
			let line = document.lineAt(range.start.line);
			let trimmedText = line.text.trim();
			if (trimmedText != '[' && trimmedText != '[]' && trimmedText != '[ ]') {
				let selector = new CodeAction("Make array", CodeActionKind.QuickFix);
				selector.command = {
					command: "current-workbench-schemas.makeSchemaDocTextRangeArray",
					title: "Make into array",
					arguments: [document, range]
				};

				selectors.push(selector);
			}
		}
		if (code.includes('deleteRange')) {
			let selector = new CodeAction("Delete this selection", CodeActionKind.QuickFix);
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
