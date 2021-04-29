import { workspace, commands, languages, window, ExtensionContext, DiagnosticCollection, Range, Diagnostic, Position } from 'vscode';
import { Kind, Source } from 'graphql';
import { DiagnosticSeverity } from 'vscode-languageclient';
import { GraphQLDocument } from 'apollo-language-server/lib/document';
import { defaultValidationRules } from 'apollo-language-server/lib/errors/validation';
import { collectExecutableDefinitionDiagnositics } from 'apollo-language-server/lib/diagnostics';

import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { FileProvider } from './workbench/file-system/fileProvider';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { FederationCodeActionProvider } from './workbench/federationCodeActionProvider';
import { ApolloStudioOperationsProvider, GettingStartedDocProvider } from './workbench/docProviders';
import { addToWorkbench } from './commands/studio-operations';
import { ensureFolderIsOpen, openFolder, enterStudioApiKey, gettingStarted, deleteStudioApiKey } from './commands/extension';
import { refreshStudioGraphs, loadOperations, viewStudioOperation, switchOrg } from './commands/studio-graphs';
import { createWorkbenchFromPreloaded, startMocks, stopMocks, deleteOperation, addOperation, viewQueryPlan, editSubgraph, deleteSubgraph, refreshSupergraphs, viewSubgraphSettings, addSubgraph, viewSupergraphSchema, editSupergraphOperation, newDesign, createWorkbenchFromSupergraph, exportSupergraphSchema, exportSupergraphApiSchema, viewSupergraphApiSchema, updateSubgraphSchemaFromURL, viewSubgraphCustomMocks, exportSubgraphSchema, exportSubgraphResolvers, createWorkbenchFromSupergraphVariant, exportRoverYAML } from './commands/local-supergraph-designs';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { WorkbenchUri } from './workbench/file-system/WorkbenchUri';

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

	//Setting up the mocks project folder - need to isolate to mocks running
	if (StateManager.instance.extensionGlobalStoragePath) {
		const mocksPath = resolve(StateManager.instance.extensionGlobalStoragePath, `mocks`);
		const packageJsonPath = resolve(mocksPath, `package.json`);
		mkdirSync(mocksPath, { recursive: true });
		writeFileSync(packageJsonPath, '{"name":"mocks", "version":"1.0"}', { encoding: 'utf-8' });
		execSync(`npm i faker`, { cwd: mocksPath });
	}
	context.subscriptions.push(compositionDiagnostics);
	context.subscriptions.push(workspace.registerFileSystemProvider('workbench', FileProvider.instance, { isCaseSensitive: true }));

	languages.registerCompletionItemProvider("graphql", federationCompletionProvider);
	languages.registerCodeActionsProvider({ language: 'graphql' }, new FederationCodeActionProvider());

	//Register Tree Data Providers
	window.registerTreeDataProvider('local-supergraph-designs', StateManager.instance.localSupergraphTreeDataProvider);
	window.registerTreeDataProvider('studio-graphs', StateManager.instance.apolloStudioGraphsProvider);
	window.registerTreeDataProvider('studio-operations', StateManager.instance.apolloStudioGraphOpsProvider);

	//Register commands to ensure a folder is open in the window to store workbench files
	commands.executeCommand('extension.ensureFolderIsOpen');
	commands.registerCommand('extension.ensureFolderIsOpen', ensureFolderIsOpen);
	commands.registerCommand('extension.openFolder', openFolder);
	//Global Extension Commands
	commands.registerCommand('extension.enterStudioApiKey', enterStudioApiKey);
	commands.registerCommand('extension.deleteStudioApiKey', deleteStudioApiKey);
	commands.registerCommand('extension.gettingStarted', gettingStarted);

	//*Local Supergraph Designs TreeView
	//**Navigation Menu Commands
	commands.registerCommand('local-supergraph-designs.newDesign', newDesign);
	commands.registerCommand('local-supergraph-designs.refresh', refreshSupergraphs);
	//***Supergraph Commands
	// commands.registerCommand('local-supergraph-designs.exportProject', exportProject);//right-click
	// commands.registerCommand('local-supergraph-designs.dockerize', async (item: WorkbenchFileTreeItem) => DockerImageManager.create(item.filePath));//right-click
	//***Supergraph Schema Commands
	commands.registerCommand('local-supergraph-designs.viewSupergraphSchema', viewSupergraphSchema);//on-click
	commands.registerCommand('local-supergraph-designs.viewSupergraphApiSchema', viewSupergraphApiSchema);//on-click
	commands.registerCommand('local-supergraph-designs.exportRoverYAML', exportRoverYAML);//right-click
	commands.registerCommand('local-supergraph-designs.exportSupergraphSchema', exportSupergraphSchema);//right-click
	commands.registerCommand('local-supergraph-designs.exportSupergraphApiSchema', exportSupergraphApiSchema);//right-click
	//****Subgraph Summary Commands 
	commands.registerCommand('local-supergraph-designs.startMocks', startMocks);
	commands.registerCommand('local-supergraph-designs.stopMocks', stopMocks);
	commands.registerCommand('local-supergraph-designs.addSubgraph', addSubgraph);
	//****Subgraph Commands 
	commands.registerCommand('local-supergraph-designs.editSubgraph', editSubgraph);//on-click
	commands.registerCommand('local-supergraph-designs.updateSubgraphSchemaFromURL', updateSubgraphSchemaFromURL);//right-click
	commands.registerCommand('local-supergraph-designs.exportSubgraphResolvers', exportSubgraphResolvers);//right-click
	commands.registerCommand('local-supergraph-designs.exportSubgraphSchema', exportSubgraphSchema);//right-click
	commands.registerCommand('local-supergraph-designs.viewSubgraphCustomMocks', viewSubgraphCustomMocks);//right-click
	commands.registerCommand('local-supergraph-designs.deleteSubgraph', deleteSubgraph);
	commands.registerCommand('local-supergraph-designs.viewSettings', viewSubgraphSettings);//inline

	commands.registerCommand('local-supergraph-designs.editOperation', editSupergraphOperation);
	commands.registerCommand('local-supergraph-designs.addOperation', addOperation);
	commands.registerCommand('local-supergraph-designs.deleteOperation', deleteOperation);
	commands.registerCommand('local-supergraph-designs.viewQueryPlan', viewQueryPlan);
	// commands.registerCommand('current-workbench-schemas.deleteSchemaDocTextRange', deleteSchemaDocTextRange);
	// commands.registerCommand('current-workbench-schemas.makeSchemaDocTextRangeArray', makeSchemaDocTextRangeArray);

	//Apollo Studio Graphs Commands
	commands.registerCommand('studio-graphs.refresh', refreshStudioGraphs);
	commands.registerCommand('studio-graphs.createWorkbenchFromGraph', createWorkbenchFromSupergraph);
	commands.registerCommand('studio-graphs.createWorkbenchFromSupergraphVariant', createWorkbenchFromSupergraphVariant);
	commands.registerCommand('studio-graphs.createWorkbenchFromPreloaded', createWorkbenchFromPreloaded);
	commands.registerCommand('studio-graphs.loadOperations', loadOperations);
	commands.registerCommand('studio-graphs.viewStudioOperation', viewStudioOperation);
	commands.registerCommand('studio-graphs.switchOrg', switchOrg);
	//Apollo Studio Graph Operations Commands
	commands.registerCommand('studio-operations.addToWorkbench', addToWorkbench);

	//Workspace - Register Providers and Events
	workspace.registerTextDocumentContentProvider(GettingStartedDocProvider.scheme, new GettingStartedDocProvider());
	workspace.registerTextDocumentContentProvider(ApolloStudioOperationsProvider.scheme, new ApolloStudioOperationsProvider());
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
	workspace.onDidSaveTextDocument(async document => {
		let uri = document.uri;
		if (uri.path.includes('mocks')) {
			const querySplit = uri.query.split(':');
			const { wbFile, path } = FileProvider.instance.workbenchFileByGraphName(querySplit[0]);
			const newMocksText = document.getText();
			if (newMocksText != wbFile.schemas[querySplit[1]].customMocks) {
				wbFile.schemas[querySplit[1]].customMocks = newMocksText;
				FileProvider.instance.saveWorkbenchFile(wbFile, path);
			}
		}
	})
}