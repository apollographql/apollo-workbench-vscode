import { StateManager } from '../workbench/stateManager';
import { workspace, window, commands } from 'vscode';
import { isValidKey } from '../graphql/graphClient';
import { log } from '../utils/logger';

export function deleteStudioApiKey() {
  StateManager.instance.globalState_userApiKey = '';
}

export async function ensureFolderIsOpen() {
  if (
    !workspace.workspaceFolders ||
    (workspace.workspaceFolders && !workspace.workspaceFolders[0])
  ) {
    const action = 'Open Folder';
    const response = await window.showErrorMessage(
      'You must open a folder to create Apollo Workbench files',
      action,
    );
    if (response == action)
      await openFolder();
  }
}

export async function enterGraphOSUserApiKey() {
  const apiKey = await window.showInputBox({
    placeHolder: 'Enter User API Key - user:gh.michael-watson:023jr324tj....',
  });
  if (apiKey && (await isValidKey(apiKey))) {
    log('GraphOS User API key validated and stored succesfully');
    StateManager.instance.globalState_userApiKey = apiKey;
  } else if (apiKey) {
    log('API key was invalid');
    window.showErrorMessage('Invalid API key entered');
  } else if (apiKey == '') {
    log('No API key entered, login cancelled.');
    window.setStatusBarMessage('Login cancelled, no API key entered', 2000);
  }
}

export async function openFolder() {
  const folder = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });
  if (folder) await commands.executeCommand('openFolder', folder[0]);
}
