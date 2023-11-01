import { Uri } from 'vscode';
import { Utils } from 'vscode-uri';

export function getFileName(filePath: string) {
  return Utils.basename(Uri.parse(filePath)).split('.')[0];
}

export function normalizePath(filePath: string) {
  if (filePath.toLowerCase().includes('c:'))
    filePath = filePath.slice(2).replace(/\\/g, '/');

  return filePath;
}
