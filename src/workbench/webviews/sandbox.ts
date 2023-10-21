import path from 'path';
import { commands, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import { startRoverDevSession } from '../../commands/local-supergraph-designs';
import { log } from '../../utils/logger';
import { getFileName } from '../../utils/path';
import { whichDesign, whichOperation } from '../../utils/uiHelpers';
import { WorkbenchDiagnostics } from '../diagnosticsManager';
import { ApolloConfig } from '../file-system/ApolloConfig';
import { FileProvider } from '../file-system/fileProvider';
import { Rover } from '../rover';
import {
  OperationTreeItem,
  SubgraphSummaryTreeItem,
} from '../tree-data-providers/superGraphTreeDataProvider';
import { StateManager } from '../stateManager';

let panel: WebviewPanel | undefined;

export async function refreshSandbox() {
  panel?.dispose();
  await openSandboxWebview();
}

export async function openSandbox(item?: OperationTreeItem, document?: string) {
  await openSandboxWebview();
}

export async function openSandboxWebview(document?: string) {
  if (!Rover.instance.primaryDevTerminal) {
    window.showErrorMessage('Unable to open sandbox, no design running.');
  }

  if (!panel) {
    panel = window.createWebviewPanel(
      'apolloSandbox',
      'Apollo Sandbox',
      ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    panel.iconPath = Uri.parse(
      path.join(__dirname, '..', 'media', 'logo-apollo.svg'),
    );

    panel.onDidDispose(() => (panel = undefined));
  }

  const routerPort = StateManager.settings_routerPort;
  const url = document
    ? `http://localhost:${routerPort}?document=${encodeURIComponent(document)}`
    : `http://localhost:${routerPort}`;
  panel.webview.html = getWebviewContent(url);

  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  panel.reveal(ViewColumn.One, false);
}

function getWebviewContent(url: string) {
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
    <iframe src="${url}">
  </body>
  </html>
    `;
}
