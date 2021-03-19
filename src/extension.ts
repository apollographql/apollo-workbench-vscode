import { workspace, commands, languages, window, ExtensionContext, DiagnosticCollection, Range, Diagnostic, Position } from 'vscode';
import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { FederationCodeActionProvider } from './workbench/federationCodeActionProvider';
import { FileProvider } from './workbench/file-system/fileProvider';
import { ApolloStudioOperationsProvider, GettingStartedDocProvider } from './workbench/docProviders';
import { Kind, Source } from 'graphql';
import { collectExecutableDefinitionDiagnositics } from 'apollo-language-server/lib/diagnostics';
import { GraphQLDocument } from 'apollo-language-server/lib/document';
import { defaultValidationRules } from 'apollo-language-server/lib/errors/validation';
import { DiagnosticSeverity } from 'vscode-languageclient';
import { refreshStudioGraphs, createWorkbenchFromGraph, createWorkbenchFromPreloaded, createWorkbenchFromGraphWithVariant, loadOperations, viewStudioOperation, switchOrg } from './commands/studio-graphs';
import { addToWorkbench } from './commands/studio-operations';
import { ensureFolderIsOpen, openFolder, newWorkbench, enterStudioApiKey, startMocks, stopMocks, gettingStarted } from './commands/extension';
import { addSchema, editSchema, renameSchema, deleteSchema, refreshSchemas, viewCsdl, shouldMockSchema, disableMockSchema, setUrlForService, updateSchemaFromUrl, viewSettings, viewCustomMocks, deleteSchemaDocTextRange, makeSchemaDocTextRangeArray } from './commands/current-workbench-schemas';
import { addOperation, deleteOperation, editOperation, refreshOperations, openQueryPlan } from './commands/current-workbench-operations';
import { loadFile, renameGraph, duplicateFile, deleteFile, refresh, exportProject } from './commands/local-workbench-files';

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
	StateManager.init(context);
	context.workspaceState.update("selectedWbFile", "");
	context.globalState.update("APOLLO_SELCTED_GRAPH_ID", "");

	context.subscriptions.push(compositionDiagnostics);
	context.subscriptions.push(workspace.registerFileSystemProvider('workbench', FileProvider.instance, { isCaseSensitive: true }));

	languages.registerCompletionItemProvider("graphql", federationCompletionProvider);
	languages.registerCodeActionsProvider({ language: 'graphql' }, new FederationCodeActionProvider());

	//Register Tree Data Providers
	window.registerTreeDataProvider('local-workbench-files', StateManager.instance.localWorkbenchFilesProvider);
	window.registerTreeDataProvider('current-workbench-schemas', StateManager.instance.currentWorkbenchSchemasProvider);
	window.registerTreeDataProvider('current-workbench-operations', StateManager.instance.currentWorkbenchOperationsProvider);
	window.registerTreeDataProvider('studio-graphs', StateManager.instance.apolloStudioGraphsProvider);
	window.registerTreeDataProvider('studio-operations', StateManager.instance.apolloStudioGraphOpsProvider);

	//Register commands to ensure a folder is open in the window to store workbench files
	commands.executeCommand('extension.ensureFolderIsOpen');
	commands.registerCommand('extension.ensureFolderIsOpen', ensureFolderIsOpen);
	commands.registerCommand('extension.openFolder', openFolder);
	//Global Extension Commands
	commands.registerCommand('extension.newWorkbench', newWorkbench);
	commands.registerCommand('extension.enterStudioApiKey', enterStudioApiKey);
	commands.registerCommand('extension.deleteStudioApiKey', enterStudioApiKey);
	commands.registerCommand('extension.startMocks', startMocks);
	commands.registerCommand('extension.stopMocks', stopMocks);
	commands.registerCommand('extension.gettingStarted', gettingStarted);
	//Current Loaded Workbench Schemas Commands
	commands.registerCommand('current-workbench-schemas.addSchema', addSchema);
	commands.registerCommand("current-workbench-schemas.editSchema", editSchema);
	commands.registerCommand("current-workbench-schemas.renameSchema", renameSchema);
	commands.registerCommand("current-workbench-schemas.deleteSchema", deleteSchema);
	commands.registerCommand('current-workbench-schemas.refreshSchemas', refreshSchemas);
	commands.registerCommand('current-workbench-schemas.viewCsdl', viewCsdl);
	//Schema Mocking Commands
	commands.registerCommand('current-workbench-schemas.shouldMockSchema', shouldMockSchema);
	commands.registerCommand('current-workbench-schemas.disableMockSchema', disableMockSchema);
	commands.registerCommand('current-workbench-schemas.setUrlForService', setUrlForService);
	commands.registerCommand('current-workbench-schemas.updateSchemaFromUrl', updateSchemaFromUrl);
	commands.registerCommand('current-workbench-schemas.viewSettings', viewSettings);
	commands.registerCommand('current-workbench-schemas.viewCustomMocks', viewCustomMocks);
	commands.registerCommand('current-workbench-schemas.deleteSchemaDocTextRange', deleteSchemaDocTextRange);
	commands.registerCommand('current-workbench-schemas.makeSchemaDocTextRangeArray', makeSchemaDocTextRangeArray);
	//Current Loaded Workbench Operations Commands
	commands.registerCommand('current-workbench-operations.addOperation', addOperation);
	commands.registerCommand("current-workbench-operations.editOperation", editOperation);
	commands.registerCommand("current-workbench-operations.deleteOperation", deleteOperation);
	commands.registerCommand('current-workbench-operations.refreshOperations', refreshOperations);
	commands.registerCommand('current-workbench-operations.openQueryPlan', openQueryPlan);
	//Local Workbench Files Commands
	commands.registerCommand("local-workbench-files.loadFile", loadFile);
	commands.registerCommand("local-workbench-files.renameGraph", renameGraph);
	commands.registerCommand("local-workbench-files.duplicateFile", duplicateFile);
	commands.registerCommand("local-workbench-files.deleteFile", deleteFile);
	commands.registerCommand('local-workbench-files.refresh', refresh);
	commands.registerCommand('local-workbench-files.exportProject', exportProject);
	//TODO: Build has only been tested locally, to be added back in
	// commands.registerCommand('local-workbench-files.dockerize', async (item: WorkbenchFileTreeItem) => DockerImageManager.create(item.filePath));
	//Apollo Studio Graphs Commands
	commands.registerCommand('studio-graphs.refresh', refreshStudioGraphs);
	commands.registerCommand('studio-graphs.createWorkbenchFromGraph', createWorkbenchFromGraph);
	commands.registerCommand('studio-graphs.createWorkbenchFromPreloaded', createWorkbenchFromPreloaded);
	commands.registerCommand('studio-graphs.createWorkbenchFromGraphWithVariant', createWorkbenchFromGraphWithVariant);
	commands.registerCommand('studio-graphs.loadOperations', loadOperations);
	commands.registerCommand('studio-graphs.viewStudioOperation', viewStudioOperation);
	commands.registerCommand('studio-graphs.switchOrg', switchOrg);
	//Apollo Studio Graph Operations Commands
	commands.registerCommand('studio-operations.addToWorkbench', addToWorkbench);

	//Workspace - Register Providers and Events
	workspace.registerTextDocumentContentProvider(GettingStartedDocProvider.scheme, new GettingStartedDocProvider());
	workspace.registerTextDocumentContentProvider(ApolloStudioOperationsProvider.scheme, new ApolloStudioOperationsProvider());
	workspace.onDidSaveTextDocument(e => {
		let uri = e.uri;
		if (uri.fsPath.includes('mocks.js') && FileProvider.instance.currrentWorkbench) {
			let mocksText = e.getText();
			let serviceName = uri.fsPath.split('-mocks.js')[0].split('/mocks/')[1];

			FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks = mocksText;
			FileProvider.instance.saveCurrentWorkbench();
		}
	})
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
}