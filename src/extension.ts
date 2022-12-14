import {
  workspace,
  commands,
  languages,
  window,
  ExtensionContext,
  WebviewPanel,
  ViewColumn,
  Uri,
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
  startRoverDevSession,
  stopRoverDevSession,
  mockSubgraph,
} from './commands/local-supergraph-designs';
import { log } from './utils/logger';
import { Rover } from './workbench/rover';
import path from 'path';

export const outputChannel = window.createOutputChannel('Apollo Workbench');

// Our event when vscode deactivates
export async function deactivate(context: ExtensionContext) {
  await Rover.instance.stopRoverDev();
}
function getWebviewContent() {
  return `
  <!DOCTYPE html>
  <head>
      <style>
          html { width: 100%; height: 100%; min-height: 100%; display: flex; }
          body { flex: 1; display: flex; }
          iframe { flex: 1; border: none; background: white; }
      </style>
  </head>
  <body >
    <!-- All content from the web server must be in an iframe -->
    <iframe src="http://localhost:3000">
  </body>
  </html>
    `;
}

let panel: WebviewPanel | undefined;

export async function activate(context: ExtensionContext) {
  StateManager.init(context);
  context.workspaceState.update('selectedWbFile', '');
  context.globalState.update('APOLLO_SELECTED_GRAPH_ID', '');

  context.subscriptions.push(
    commands.registerCommand('extension.sandbox', () => {
      if (!panel) {
        panel = window.createWebviewPanel(
          'apolloSandbox',
          'Apollo Sandbox',
          ViewColumn.One,
          {
            enableScripts: true,
          },
        );
        panel.iconPath = Uri.parse(path.join(
          __filename,
          '..',
          '..',
          'media',
          'logo-apollo.svg',
        )); 
        panel.webview.html = getWebviewContent();
        panel.onDidDispose(() => (panel = undefined));
      }

      panel.reveal(ViewColumn.One);
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
    'local-supergraph-designs.mockSubgraph',
    mockSubgraph,
  );
  commands.registerCommand(
    'local-supergraph-designs.startMocks',
    startRoverDevSession,
  );

  commands.registerCommand(
    'local-supergraph-designs.stopMocks',
    stopRoverDevSession,
  );
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
                  schemaUri,
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
