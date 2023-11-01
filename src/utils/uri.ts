import { resolve } from 'path';
import { StateManager } from '../workbench/stateManager';
import { Uri } from 'vscode';
import { normalizePath } from './path';

export const resolvePath = (filePath: string) => {
  const path = resolve(StateManager.workspaceRoot ?? '', filePath);
  return Uri.parse(normalizePath(path));
};
