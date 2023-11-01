import {
  Uri,
  ViewColumn,
  Webview,
  WebviewPanel,
  window,
  workspace,
} from 'vscode';
import { whichDesign, whichOperation } from '../../utils/uiHelpers';
import { FileProvider } from '../file-system/fileProvider';
import { StateManager } from '../stateManager';
import { OperationTreeItem } from '../tree-data-providers/tree-items/local-supergraph-designs/operationTreeItem';

function getWebviewContent(webview: Webview, src: any) {
  return `
  <!DOCTYPE html>
  <head>
    <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource}; style-src ${webview.cspSource};"
    />
      <style>
        html, body { height: 100%; margin: 0; padding: 0; }
        div { position: relative; height: 100%; width: 100%; }
        div img { margin: auto; position: absolute;  top: 0; left: 0; right: 0; bottom:0; }
      </style>
  </head>
  <body>
    <div>
      <img src="${src}">
    </div>
  </body>
  </html>
    `;
}
let operationDesignPanel: WebviewPanel | undefined;

function viewDesignImage(url: Uri) {
  if (operationDesignPanel)
    operationDesignPanel.webview.html = getWebviewContent(
      operationDesignPanel.webview,
      url,
    );

  return operationDesignPanel;
}

async function viewDesignImageFromFile(path: string, operationName?: string) {
  const panel = operationDesignPanel;
  if (panel) {
    //Copy image file to extension directory, media/temp is in gitignore
    const tempUri = Uri.joinPath(
      StateManager.instance.context.extensionUri,
      'media',
      'temp',
      `${operationName}.graphql`,
    );
    await workspace.fs.copy(Uri.parse(path), tempUri, { overwrite: true });
    const localFile = panel.webview.asWebviewUri(tempUri);
    panel.webview.html = getWebviewContent(panel.webview, localFile);

    return panel;
  }
}

export async function viewOperationDesign(item?: OperationTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;
  const operationName = item
    ? item.operationName
    : await whichOperation(wbFilePath);
  if (!operationName) return;

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  const operation = wbFile.operations[operationName];
  if (!operation.ui_design) {
    const response = await window.showInformationMessage(
      `No UI design saved for operation`,
      'Add image source',
    );
    if (response == 'Add image source') {
      const uiDesign = await window.showInputBox({
        title: 'Enter the file path or remote url where the UI design image is',
        prompt:
          'https://my-website.com/images/a.png or /Users/Me/Desktop/a.png',
      });
      if (uiDesign) wbFile.operations[operationName].ui_design = uiDesign;

      await FileProvider.instance.writeWorkbenchConfig(wbFilePath, wbFile);

      await viewOperationDesign(item);
    }
    return;
  }

  if (!operationDesignPanel) {
    operationDesignPanel = window.createWebviewPanel(
      'operationDesign',
      'Operation Design',
      { viewColumn: ViewColumn.One, preserveFocus: false },
      {
        enableScripts: false,
      },
    );

    operationDesignPanel.onDidDispose(
      (e) => (operationDesignPanel = undefined),
    );
  }

  if (operation.ui_design) {
    const uri = Uri.parse(operation.ui_design);
    if (uri.scheme === 'file') return await viewDesignImageFromFile(uri.fsPath);
    else return viewDesignImage(uri);
  }
}
