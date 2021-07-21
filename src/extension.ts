import {
  workspace,
  commands,
  languages,
  window,
  ExtensionContext,
  DiagnosticCollection,
  Range,
  Diagnostic,
  Position,
  WebviewPanel,
} from 'vscode';
import { Kind, Source } from 'graphql';
import { DiagnosticSeverity } from 'vscode-languageclient';
import { GraphQLDocument } from './utils/operation-diagnostics/document';
import { collectExecutableDefinitionDiagnositics } from './utils/operation-diagnostics/diagnostics';

import { StateManager } from './workbench/stateManager';
import { ServerManager } from './workbench/serverManager';
import { FileProvider } from './workbench/file-system/fileProvider';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { FederationCodeActionProvider } from './workbench/federationCodeActionProvider';
import {
  ApolloStudioOperationsProvider,
  GettingStartedDocProvider,
} from './workbench/docProviders';
import { addToWorkbench } from './commands/studio-operations';
import {
  ensureFolderIsOpen,
  openFolder,
  enterStudioApiKey,
  gettingStarted,
  deleteStudioApiKey,
} from './commands/extension';
import {
  refreshStudioGraphs,
  loadOperations,
  viewStudioOperation,
  switchOrg,
} from './commands/studio-graphs';
import {
  createWorkbenchFromPreloaded,
  startMocksWithDialog,
  stopMocks,
  deleteOperation,
  addOperation,
  viewQueryPlan,
  editSubgraph,
  deleteSubgraph,
  refreshSupergraphs,
  viewSubgraphSettings,
  addSubgraph,
  viewSupergraphSchema,
  editSupergraphOperation,
  newDesign,
  createWorkbenchFromSupergraph,
  exportSupergraphSchema,
  exportSupergraphApiSchema,
  viewSupergraphApiSchema,
  updateSubgraphSchemaFromURL,
  viewSubgraphCustomMocks,
  exportSubgraphSchema,
  exportSubgraphResolvers,
  createWorkbenchFromSupergraphVariant
} from './commands/local-supergraph-designs';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { log } from './utils/logger';

interface WorkbenchDiagnostics {
  operationDiagnostics: DiagnosticCollection
  compositionDiagnostics: DiagnosticCollection
}
export const diagnosticCollections: Map<string, WorkbenchDiagnostics> = new Map<string, WorkbenchDiagnostics>();

export const outputChannel = window.createOutputChannel('Apollo Workbench');

// Our event when vscode deactivates
export async function deactivate(context: ExtensionContext) {
  ServerManager.instance.stopMocks();
}

export async function activate(context: ExtensionContext) {
  StateManager.init(context);
  context.workspaceState.update('selectedWbFile', '');
  context.globalState.update('APOLLO_SELCTED_GRAPH_ID', '');

  //Setting up the mocks project folder - need to isolate to mocks running
  if (StateManager.instance.extensionGlobalStoragePath) {
    const mocksPath = resolve(
      StateManager.instance.extensionGlobalStoragePath,
      `mocks`,
    );
    const packageJsonPath = resolve(mocksPath, `package.json`);
    mkdirSync(mocksPath, { recursive: true });
    writeFileSync(packageJsonPath, '{"name":"mocks", "version":"1.0"}', {
      encoding: 'utf-8',
    });
    execSync(`npm i faker`, { cwd: mocksPath });
  }

  context.subscriptions.push(
    workspace.registerFileSystemProvider('workbench', FileProvider.instance, {
      isCaseSensitive: true,
    }),
  );

  languages.registerCompletionItemProvider(
    'graphql',
    federationCompletionProvider,
  );
  languages.registerCodeActionsProvider(
    { language: 'graphql' },
    new FederationCodeActionProvider(),
  );

  //Register Tree Data Providers
  window.registerTreeDataProvider(
    'local-supergraph-designs',
    StateManager.instance.localSupergraphTreeDataProvider,
  );
  window.registerTreeDataProvider(
    'studio-graphs',
    StateManager.instance.apolloStudioGraphsProvider,
  );
  window.registerTreeDataProvider(
    'studio-operations',
    StateManager.instance.apolloStudioGraphOpsProvider,
  );

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
  commands.registerCommand(
    'local-supergraph-designs.refresh',
    refreshSupergraphs,
  );
  //***Supergraph Commands
  // commands.registerCommand('local-supergraph-designs.exportProject', exportProject);//right-click
  // commands.registerCommand('local-supergraph-designs.dockerize', async (item: WorkbenchFileTreeItem) => DockerImageManager.create(item.filePath));//right-click
  //***Supergraph Schema Commands
  commands.registerCommand(
    'local-supergraph-designs.viewSupergraphSchema',
    viewSupergraphSchema,
  ); //on-click
  commands.registerCommand(
    'local-supergraph-designs.viewSupergraphApiSchema',
    viewSupergraphApiSchema,
  ); //on-click
  commands.registerCommand(
    'local-supergraph-designs.exportSupergraphSchema',
    exportSupergraphSchema,
  ); //right-click
  commands.registerCommand(
    'local-supergraph-designs.exportSupergraphApiSchema',
    exportSupergraphApiSchema,
  ); //right-click
  //****Subgraph Summary Commands
  commands.registerCommand('local-supergraph-designs.startMocks', startMocksWithDialog);
  commands.registerCommand('local-supergraph-designs.stopMocks', stopMocks);
  commands.registerCommand('local-supergraph-designs.addSubgraph', addSubgraph);
  //****Subgraph Commands
  commands.registerCommand(
    'local-supergraph-designs.editSubgraph',
    editSubgraph,
  ); //on-click
  commands.registerCommand(
    'local-supergraph-designs.updateSubgraphSchemaFromURL',
    updateSubgraphSchemaFromURL,
  ); //right-click
  commands.registerCommand(
    'local-supergraph-designs.exportSubgraphResolvers',
    exportSubgraphResolvers,
  ); //right-click
  commands.registerCommand(
    'local-supergraph-designs.exportSubgraphSchema',
    exportSubgraphSchema,
  ); //right-click
  commands.registerCommand(
    'local-supergraph-designs.viewSubgraphCustomMocks',
    viewSubgraphCustomMocks,
  ); //right-click
  commands.registerCommand(
    'local-supergraph-designs.deleteSubgraph',
    deleteSubgraph,
  );
  commands.registerCommand(
    'local-supergraph-designs.viewSettings',
    viewSubgraphSettings,
  ); //inline

  commands.registerCommand(
    'local-supergraph-designs.editOperation',
    editSupergraphOperation,
  );
  commands.registerCommand(
    'local-supergraph-designs.addOperation',
    addOperation,
  );
  commands.registerCommand(
    'local-supergraph-designs.deleteOperation',
    deleteOperation,
  );
  commands.registerCommand(
    'local-supergraph-designs.viewQueryPlan',
    viewQueryPlan,
  );
  //TODO: Need to implemnt loading image in a custom view, will come in following release
  // commands.registerCommand(
  //   'local-supergraph-designs.setOperationDesignMock',
  //   setOperationDesignMock,
  // );

  if (window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    window.registerWebviewPanelSerializer("apolloWorkbenchDesign", {
      async deserializeWebviewPanel(webviewPanel: WebviewPanel, state: any) {
        log(`Got state: ${state}`)
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        // webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
      }
    });
  }
  // commands.registerCommand('current-workbench-schemas.deleteSchemaDocTextRange', deleteSchemaDocTextRange);
  // commands.registerCommand('current-workbench-schemas.makeSchemaDocTextRangeArray', makeSchemaDocTextRangeArray);

  //Apollo Studio Graphs Commands
  commands.registerCommand('studio-graphs.refresh', refreshStudioGraphs);
  commands.registerCommand(
    'studio-graphs.createWorkbenchFromGraph',
    createWorkbenchFromSupergraph,
  );
  commands.registerCommand(
    'studio-graphs.createWorkbenchFromSupergraphVariant',
    createWorkbenchFromSupergraphVariant,
  );
  commands.registerCommand(
    'studio-graphs.createWorkbenchFromPreloaded',
    createWorkbenchFromPreloaded,
  );
  commands.registerCommand('studio-graphs.loadOperations', loadOperations);
  commands.registerCommand(
    'studio-graphs.viewStudioOperation',
    viewStudioOperation,
  );
  commands.registerCommand('studio-graphs.switchOrg', switchOrg);
  //Apollo Studio Graph Operations Commands
  commands.registerCommand('studio-operations.addToWorkbench', addToWorkbench);

  //Workspace - Register Providers and Events
  workspace.registerTextDocumentContentProvider(
    GettingStartedDocProvider.scheme,
    new GettingStartedDocProvider(),
  );
  workspace.registerTextDocumentContentProvider(
    ApolloStudioOperationsProvider.scheme,
    new ApolloStudioOperationsProvider(),
  );
  //This ensures the visible text editor loads the correct design for composition errors 
  window.onDidChangeActiveTextEditor((e) => {
    if (e) {
      const uri = e.document.uri;
      const path = uri.path;
      const updateComposition = (path.includes('subgraphs') || path.includes('queries'));
      if (uri.scheme == 'workbench' && updateComposition) {
        const designPath = path.split('/subgraphs')[0];
        FileProvider.instance.loadWorkbenchForComposition(designPath);
      }
    }
  })
  workspace.onDidDeleteFiles(e => {
    let deletedWorkbenchFile = false;
    e.files.forEach(f => {
      if (f.path.includes('.apollo-workbench')) deletedWorkbenchFile = true;
    })

    if (deletedWorkbenchFile) {
      FileProvider.instance.refreshLocalWorkbenchFiles();
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
    }
  })
  workspace.onDidChangeTextDocument((e) => {
    const uri = e.document.uri;
    const document = new GraphQLDocument(new Source(e.document.getText()));
    if (uri.scheme == 'workbench') {
      if (uri.path.includes('queries')) {
        const schema = StateManager.instance.workspaceState_schema;
        const operationDiagnostic = diagnosticCollections.get(FileProvider.instance.loadedWorbenchFilePath)?.operationDiagnostics;

        if (operationDiagnostic) {
          if (schema) {
            const fragments = Object.create(null);
            if (document.ast) {
              for (const definition of document.ast.definitions) {
                if (definition.kind === Kind.FRAGMENT_DEFINITION) {
                  fragments[definition.name.value] = definition;
                }
              }
            }
            const opDiagnostics = collectExecutableDefinitionDiagnositics(
              schema,
              document,
              fragments
            );

            if (opDiagnostics.length > 0) {
              operationDiagnostic.clear();
              const diagnostics = new Array<Diagnostic>();
              opDiagnostics.forEach((opDiag) => {
                const start = opDiag.range.start;
                const end = opDiag.range.end;
                const range = new Range(
                  new Position(start.line, start.character),
                  new Position(end.line, end.character),
                );
                diagnostics.push(
                  new Diagnostic(range, opDiag.message, opDiag.severity),
                );
              });
              operationDiagnostic.set(uri, diagnostics);
            } else {
              operationDiagnostic.clear();
            }
          } else {
            operationDiagnostic.clear();
            operationDiagnostic.set(uri, [
              new Diagnostic(
                new Range(0, 0, 0, 0),
                'No valid composed schema',
                DiagnosticSeverity.Warning,
              ),
            ]);
          }
        }
      }
    }
  });
  workspace.onDidSaveTextDocument(async (document) => {
    const uri = document.uri;
    if (uri.path.includes('mocks')) {
      const querySplit = uri.query.split(':');
      const { wbFile, path } = FileProvider.instance.workbenchFileByGraphName(
        querySplit[0],
      );
      const newMocksText = document.getText();
      if (newMocksText != wbFile.schemas[querySplit[1]].customMocks) {
        wbFile.schemas[querySplit[1]].customMocks = newMocksText;
        FileProvider.instance.saveWorkbenchFile(wbFile, path);
      }
    }
  });
}
