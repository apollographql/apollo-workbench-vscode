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

let panel: WebviewPanel | undefined;

export async function openSandbox(item?: OperationTreeItem, document?: string) {
  let errors = 0;
  WorkbenchDiagnostics.instance.diagnosticCollections
    .get(item?.wbFilePath ?? '')
    ?.compositionDiagnostics.forEach(() => errors++);
  if (errors > 0) {
    commands.executeCommand('workbench.action.showErrorsWarnings');
    window.showErrorMessage('Unable to start design due to composition errors');
    return;
  }
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const operationName = item
    ? item.operationName
    : await whichOperation(wbFilePath);

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);

  if (!Rover.instance.primaryDevTerminal) {
    await startRoverDevSession(
      new SubgraphSummaryTreeItem(wbFile.subgraphs, wbFilePath),
    );
  }

  if (!document && operationName) document = wbFile.operations[operationName].document;

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
        retainContextWhenHidden: true,
      }
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
