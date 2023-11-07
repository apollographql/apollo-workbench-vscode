import path from 'path';
import {
  ProgressLocation,
  Uri,
  ViewColumn,
  WebviewPanel,
  window,
} from 'vscode';
import { Rover } from '../rover';
import { StateManager } from '../stateManager';
import { OperationTreeItem } from '../tree-data-providers/tree-items/local-supergraph-designs/operationTreeItem';
import { parse, print } from 'graphql';

let panel: WebviewPanel | undefined;

export async function refreshSandbox() {
  panel?.dispose();
  await openSandboxWebview();
}

export async function openSandbox(item?: OperationTreeItem, document?: string) {
  if (!Rover.instance.primaryDevTerminal && item?.wbFilePath) {
    await window.withProgress(
      {
        title: `Starting rover dev session`,
        cancellable: false,
        location: ProgressLocation.Notification,
      },
      async (progress) => {
        await Rover.instance.startRoverDev(item.wbFilePath, progress);
      },
    );
    await openSandboxWebview(print(parse(item?.operationConfig?.document)));
  } else window.showErrorMessage('Unable to open sandbox, no design running.');
}

export async function openSandboxWebview(document?: string) {
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
