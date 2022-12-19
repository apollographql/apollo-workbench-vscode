import path from 'path';
import { commands, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import { startRoverDevSession } from '../../commands/local-supergraph-designs';
import { WorkbenchDiagnostics } from '../diagnosticsManager';
import { ApolloConfig } from '../file-system/ApolloConfig';
import { Rover } from '../rover';
import {
  OperationSummaryTreeItem,
  OperationTreeItem,
  SubgraphSummaryTreeItem,
} from '../tree-data-providers/superGraphTreeDataProvider';

let panel: WebviewPanel | undefined;

export async function openSandbox(item?: OperationTreeItem, document?: string) {
  let errors = 0;
  WorkbenchDiagnostics.instance.diagnosticCollections
    .get(item?.wbFilePath ?? "")
    ?.compositionDiagnostics.forEach(() => errors++);
  if (errors > 0) {
    commands.executeCommand('workbench.action.showErrorsWarnings');
    window.showErrorMessage("Unable to start design due to composition errors");
    return;
  }

  if (!Rover.instance.primaryDevTerminal) {
    if (item)
      await startRoverDevSession(
        new SubgraphSummaryTreeItem(item.wbFile, item.wbFilePath),
      );
    else {
      window.showErrorMessage('Unable to start design, no design running.');
      return;
    }
  }

  if (item && !document)
    document = item.wbFile.operations[item.operationName].document;

  await open(document);
}

async function open(document?: string) {
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
      },
    );
    panel.iconPath = Uri.parse(
      path.join(__filename, '..', '..', 'media', 'logo-apollo.svg'),
    );

    panel.onDidDispose(() => (panel = undefined));
  }

  const url = document
    ? `http://localhost:3000?document=${encodeURIComponent(document)}`
    : `http://localhost:3000`;
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
