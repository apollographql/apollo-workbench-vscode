import { window } from 'vscode';

export const outputChannel = window.createOutputChannel('Apollo Workbench');

export function activate(extension: any) {
  console.log('hello world');
}

console.log = function (str: string) {
  outputChannel.appendLine(str);
};
