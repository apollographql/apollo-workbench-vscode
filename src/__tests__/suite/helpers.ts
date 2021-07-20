import * as vscode from 'vscode';
import * as path from 'path';
import { readdirSync, unlinkSync } from 'fs';
import { FileProvider } from '../../workbench/file-system/fileProvider';
import { log } from 'util';

export const activateExtension = async () => {
  return new Promise<void>((resolve) => {
    const extension = vscode.extensions.getExtension(
      'ApolloGraphQL.apollo-workbench-vscode',
    );
    if (extension) {
      extension.activate().then(resolve);
    } else {
      resolve();
    }
  });
};

export function cleanupWorkbenchFiles() {
  try {
    const directory = path.resolve(__dirname, '..', './test-workbench');
    const dirents = readdirSync(directory, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.isFile() && dirent.name.includes('.apollo-workbench'))
        unlinkSync(path.resolve(directory, dirent.name));
    }
  } catch (err) {
    log(`Cleanup Error: ${err}`);
  }
  FileProvider.instance.clearWorkbenchFiles();
}

export async function createAndLoadEmptyWorkbenchFile() {
  // const workbenchFileName = 'empty-workbench';
  // const workbenchFilePath = FileProvider.instance.createNewWorkbenchFile(workbenchFileName);
  // if (!workbenchFilePath) throw new Error('Workbench file was not created');
  // await FileProvider.instance.loadWorkbenchFile(workbenchFileName, workbenchFilePath);
}

export const simpleSchema = `
type A @key(fields:"id"){
    id: ID!
}
extend type Query {
    a: A
}
`;
