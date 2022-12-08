import {
  workspace,
  commands,
  languages,
  window,
  ExtensionContext,
  WebviewPanel,
} from 'vscode';

import { StateManager } from './workbench/stateManager';
import {
  FileProvider,
  schemaFileUri,
} from './workbench/file-system/fileProvider';
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
  editSubgraph,
  deleteSubgraph,
  refreshSupergraphs,
  viewSubgraphSettings,
  addSubgraph,
  viewSupergraphSchema,
  newDesign,
  createWorkbenchFromSupergraph,
  exportSupergraphSchema,
  createWorkbenchFromSupergraphVariant,
  addFederationDirective,
} from './commands/local-supergraph-designs';
import { log } from './utils/logger';
import { WorkbenchDiagnostics } from './workbench/diagnosticsManager';

export const outputChannel = window.createOutputChannel('Apollo Workbench');

// Our event when vscode deactivates
// export async function deactivate(context: ExtensionContext) {}

export async function activate(context: ExtensionContext) {
  StateManager.init(context);
  context.workspaceState.update('selectedWbFile', '');
  context.globalState.update('APOLLO_SELCTED_GRAPH_ID', '');

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
    'local-supergraph-designs.viewSettings',
    viewSubgraphSettings,
  ); //inline

  if (window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    window.registerWebviewPanelSerializer('apolloWorkbenchDesign', {
      async deserializeWebviewPanel(webviewPanel: WebviewPanel, state: any) {
        log(`Got state: ${state}`);
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        // webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
      },
    });
  }
  commands.registerCommand(
    'current-workbench-schemas.addFederationDirective',
    addFederationDirective,
  );
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
  workspace.onDidCloseTextDocument((e) => {
    const uri = e.uri;
    if (uri.scheme == 'workbench') {
      if (uri.path.includes('queries')) {
        WorkbenchDiagnostics.instance.validateAllOperations(
          FileProvider.instance.loadedWorbenchFilePath,
        );
      }
    }
  });
  workspace.onDidDeleteFiles((e) => {
    let deletedWorkbenchFile = false;
    e.files.forEach((f) => {
      if (f.path.includes('.apollo-workbench')) deletedWorkbenchFile = true;
    });

    if (deletedWorkbenchFile) {
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
    }
  });
  workspace.onDidSaveTextDocument((doc) => {
    const docPath = doc.uri.fsPath;

    FileProvider.instance.getWorkbenchFiles().forEach((wbFile, wbFilePath) => {
      Object.keys(wbFile.subgraphs).forEach(async (subgraphName) => {
        const { file, workbench_design } =
          wbFile.subgraphs[subgraphName].schema;
        if (
          schemaFileUri(file, wbFilePath).fsPath == docPath ||
          schemaFileUri(workbench_design, wbFilePath).fsPath == docPath
        )
          await FileProvider.instance.refreshWorkbenchFileComposition(
            wbFilePath,
          );
      });
    });
  });
}
