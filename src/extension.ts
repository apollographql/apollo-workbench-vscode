import {
  workspace,
  commands,
  languages,
  window,
  ExtensionContext,
  Uri,
  StatusBarItem,
  StatusBarAlignment,
} from 'vscode';

import { StateManager } from './workbench/stateManager';
import {
  FileProvider,
  schemaFileUri,
} from './workbench/file-system/fileProvider';
import { federationCompletionProvider } from './workbench/federationCompletionProvider';
import { FederationCodeActionProvider } from './workbench/federationCodeActionProvider';
import {
  ApolloRemoteSchemaProvider,
  ApolloStudioOperationsProvider,
  DesignOperationsDocumentProvider,
} from './workbench/docProviders';
import { addToDesign } from './commands/studio-operations';
import {
  ensureFolderIsOpen,
  enterGraphOSUserApiKey,
  deleteStudioApiKey as logout,
  signUp,
} from './commands/extension';
import {
  refreshStudioGraphs as refreshSupergraphsFromGraphOS,
  loadOperationsFromGraphOS,
  viewStudioOperation,
  switchOrg,
  openInGraphOS,
} from './commands/studio-graphs';
import {
  editSubgraph,
  deleteSubgraph,
  refreshSupergraphs,
  addSubgraph,
  viewSupergraphSchema,
  newDesign,
  newDesignFromGraphOSSupergraph,
  exportSupergraphSchema,
  addFederationDirective,
  startRoverDevSession,
  stopRoverDevSession,
  enableMocking,
  disableMocking,
  viewOperationDesignSideBySide,
  addOperation,
  checkSubgraphSchema,
  deleteOperation,
  addCustomMocksToSubgraph,
  changeDesignFederationVersion,
} from './commands/local-supergraph-designs';
import { Rover } from './workbench/rover';
import { viewOperationDesign } from './workbench/webviews/operationDesign';
import { openSandbox, refreshSandbox } from './workbench/webviews/sandbox';
import { FederationReferenceProvider } from './workbench/federationReferenceProvider';

export const outputChannel = window.createOutputChannel('Apollo Workbench');

process.stdin.resume(); // so the program will not close instantly

function exitHandler(options, exitCode) {
  if (options.cleanup) Rover.instance.stopRoverDev();
  if (exitCode || exitCode === 0) console.log(exitCode);
  if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));

// Our event when vscode deactivates
export async function deactivate(context: ExtensionContext) {
  await Rover.instance.stopRoverDev();
}

export let statusBar: StatusBarItem;

export async function activate(context: ExtensionContext) {
  StateManager.init(context);
  context.workspaceState.update('selectedWbFile', '');
  context.globalState.update('APOLLO_SELECTED_GRAPH_ID', '');
  statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);

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
  commands.registerCommand('extension.ensureFolderIsOpen', ensureFolderIsOpen);
  commands.executeCommand('extension.ensureFolderIsOpen');
  //Global Extension Commands
  commands.registerCommand('extension.login', enterGraphOSUserApiKey);
  commands.registerCommand('extension.logout', logout);
  commands.registerCommand('extension.signUp', signUp);

  //*Local Supergraph Designs TreeView
  //**Navigation Menu Commands
  commands.registerCommand('local-supergraph-designs.newDesign', newDesign);
  commands.registerCommand(
    'local-supergraph-designs.refresh',
    refreshSupergraphs,
  );
  //***Supergraph Schema Commands
  commands.registerCommand(
    'local-supergraph-designs.viewSupergraphSchema',
    viewSupergraphSchema,
  ); //on-click
  commands.registerCommand(
    'local-supergraph-designs.exportSupergraphSchema',
    exportSupergraphSchema,
  ); //right-click
  //****Subgraph Summary Commands
  commands.registerCommand('local-supergraph-designs.addSubgraph', addSubgraph);
  //****Subgraph Commands
  commands.registerCommand(
    'local-supergraph-designs.editSubgraph',
    editSubgraph,
  ); //on-click
  commands.registerCommand(
    'local-supergraph-designs.deleteSubgraph',
    deleteSubgraph,
  );
  commands.registerCommand(
    'local-supergraph-designs.checkSubgraphSchema',
    checkSubgraphSchema,
  );
  commands.registerCommand(
    'local-supergraph-designs.enableMocking',
    enableMocking,
  );
  commands.registerCommand(
    'local-supergraph-designs.disableMocking',
    disableMocking,
  );
  commands.registerCommand(
    'local-supergraph-designs.addCustomMocksToSubgraph',
    addCustomMocksToSubgraph,
  );
  commands.registerCommand(
    'local-supergraph-designs.startRoverDevSession',
    startRoverDevSession,
  );
  commands.registerCommand(
    'local-supergraph-designs.changeDesignFederationVersion',
    changeDesignFederationVersion,
  );

  commands.registerCommand(
    'local-supergraph-designs.stopRoverDevSession',
    stopRoverDevSession,
  );

  context.subscriptions.push(
    commands.registerCommand(
      'local-supergraph-designs.viewOperationDesignSideBySide',
      viewOperationDesignSideBySide,
    ),
  );
  context.subscriptions.push(
    commands.registerCommand('local-supergraph-designs.sandbox', openSandbox),
  );
  context.subscriptions.push(
    commands.registerCommand(
      'local-supergraph-designs.refreshSandbox',
      refreshSandbox,
    ),
  );
  context.subscriptions.push(
    commands.registerCommand(
      'local-supergraph-designs.addOperation',
      addOperation,
    ),
  );
  context.subscriptions.push(
    commands.registerCommand(
      'local-supergraph-designs.deleteOperation',
      deleteOperation,
    ),
  );
  context.subscriptions.push(
    commands.registerCommand(
      'local-supergraph-designs.viewOperationDesign',
      viewOperationDesign,
    ),
  );

  commands.registerCommand(
    'current-workbench-schemas.addFederationDirective',
    addFederationDirective,
  );
  //Apollo Studio Graphs Commands
  commands.registerCommand(
    'studio-graphs.refreshSupergraphsFromGraphOS',
    refreshSupergraphsFromGraphOS,
  );
  commands.registerCommand('studio-graphs.openInGraphOS', openInGraphOS);
  commands.registerCommand(
    'studio-graphs.newDesignFromGraphOSSupergraph',
    newDesignFromGraphOSSupergraph,
  );
  commands.registerCommand(
    'studio-graphs.loadOperationsFromGraphOS',
    loadOperationsFromGraphOS,
  );
  commands.registerCommand(
    'studio-graphs.viewStudioOperation',
    viewStudioOperation,
  );
  commands.registerCommand('studio-graphs.switchOrg', switchOrg);
  //Apollo Studio Graph Operations Commands
  commands.registerCommand('studio-operations.addToDesign', addToDesign);

  //Workspace - Register Providers and Events
  workspace.registerTextDocumentContentProvider(
    ApolloStudioOperationsProvider.scheme,
    new ApolloStudioOperationsProvider(),
  );
  workspace.registerTextDocumentContentProvider(
    ApolloRemoteSchemaProvider.scheme,
    new ApolloRemoteSchemaProvider(),
  );
  languages.registerReferenceProvider(
    { language: 'graphql' },
    new FederationReferenceProvider(),
  );

  workspace.registerFileSystemProvider(
    DesignOperationsDocumentProvider.scheme,
    new DesignOperationsDocumentProvider(),
    {
      isCaseSensitive: true,
    },
  );
  workspace.onDidDeleteFiles((e) => {
    let deletedWorkbenchFile = false;
    e.files.forEach((f) => {
      const wbFile = FileProvider.instance.workbenchFileFromPath(f.fsPath);
      if (wbFile) deletedWorkbenchFile = true;
    });
    if (deletedWorkbenchFile)
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
  });
  workspace.onDidSaveTextDocument((doc) => {
    const docPath = doc.uri.fsPath;

    FileProvider.instance
      .getWorkbenchFiles()
      .forEach(async (wbFile, wbFilePath) => {
        if (docPath == wbFilePath)
          StateManager.instance.localSupergraphTreeDataProvider.refresh();
        else
          Object.keys(wbFile.subgraphs).forEach(async (subgraphName) => {
            const { file, workbench_design } =
              wbFile.subgraphs[subgraphName].schema;
            let schemaUri: Uri | undefined;
            if (workbench_design)
              schemaUri = schemaFileUri(workbench_design, wbFilePath);
            else if (file) schemaUri = schemaFileUri(file, wbFilePath);

            if (schemaUri && schemaUri.fsPath == docPath) {
              const composedSchema =
                await FileProvider.instance.refreshWorkbenchFileComposition(
                  wbFilePath,
                );

              if (composedSchema)
                await Rover.instance.restartMockedSubgraph(
                  subgraphName,
                  wbFile.subgraphs[subgraphName],
                );
              else if (Rover.instance.primaryDevTerminal) {
                window.showErrorMessage(
                  `Stopping rover dev session because of invalid composition`,
                );
                Rover.instance.stopRoverDev();
                commands.executeCommand('workbench.action.showErrorsWarnings');
              }
            }
          });
      });
  });
}
