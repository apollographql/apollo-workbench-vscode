import { StateManager } from '../workbench/stateManager';
import { workspace, window, commands } from 'vscode';
import { isValidKey } from '../graphql/graphClient';

export function deleteStudioApiKey() {
  StateManager.instance.globalState_userApiKey = '';
}

export async function ensureFolderIsOpen() {
  if (
    !workspace.workspaceFolders ||
    (workspace.workspaceFolders && !workspace.workspaceFolders[0])
  ) {
    let openFolder = 'Open Folder';
    let response = await window.showErrorMessage(
      'You must open a folder to create Apollo Workbench files',
      openFolder,
    );
    if (response == openFolder)
      await commands.executeCommand('extension.openFolder');
  }
}

export async function enterStudioApiKey() {
  let apiKey = await window.showInputBox({
    placeHolder: 'Enter User API Key - user:gh.michael-watson:023jr324tj....',
  });
  if (apiKey && (await isValidKey(apiKey))) {
    StateManager.instance.globalState_userApiKey = apiKey;
  } else if (apiKey) {
    window.showErrorMessage('Invalid API key entered');
  } else if (apiKey == '') {
    window.setStatusBarMessage('Login cancelled, no API key entered', 2000);
  }
}

export async function gettingStarted(item) {
  window
    .showTextDocument(item.uri)
    .then(() => commands.executeCommand('markdown.showPreviewToSide'))
    .then(() =>
      commands.executeCommand('workbench.action.closeEditorsInOtherGroups'),
    )
    .then(
      () => {},
      (e) => console.error(e),
    );
}

export async function openFolder() {
  let folder = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });
  if (folder) await commands.executeCommand('openFolder', folder[0]);
}
