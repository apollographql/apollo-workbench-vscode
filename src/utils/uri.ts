import { resolve } from 'path';
import { StateManager } from '../workbench/stateManager';
import { Uri } from 'vscode';

export const resolvePath = (filePath: string) => {
  const path = resolve(StateManager.workspaceRoot ?? '', filePath);
  return Uri.parse(path);
};
