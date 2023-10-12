import { window } from 'vscode';
import { ApolloConfig } from '../workbench/file-system/ApolloConfig';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { getFileName } from './path';

/**
 * Prompts the user to select a design from the currently loaded folder
 * @returns File path to config or `undefined` if cancelled by user
 */
export async function whichDesign() {
  const options: {
    [key: string]: string;
  } = {};
  const wbFiles = FileProvider.instance.getWorkbenchFiles();
  wbFiles.forEach((wbFile, wbFilePath) => {
    options[getFileName(wbFilePath)] = wbFilePath;
  });
  const optionSelected = await window.showQuickPick(Object.keys(options), {
    title: 'Select a design',
  });
  if (!optionSelected) return undefined;

  return options[optionSelected];
}
/**
 * Prompts the user to select a design from the currently loaded folder
 * @returns File path to config or `undefined` if cancelled by user
 */
 export async function whichSubgraph(wbFilePath: string) {
  const wbFile= FileProvider.instance.workbenchFileFromPath(wbFilePath);
  const optionSelected = await window.showQuickPick(Object.keys(wbFile.subgraphs).sort(), {
    title: 'Select a subgraph',
  });
  if (!optionSelected) return undefined;

  return optionSelected;
}
/**
 * Prompts the user to select an operations from the design file
 * @returns File path to config or `undefined` if cancelled by user
 */
 export async function whichOperation(wbFilePath: string) {
  const wbFile= FileProvider.instance.workbenchFileFromPath(wbFilePath);
  const optionSelected = await window.showQuickPick(Object.keys(wbFile.operations).sort(), {
    title: 'Select a subgraph',
  });
  if (!optionSelected) return undefined;

  return optionSelected;
}