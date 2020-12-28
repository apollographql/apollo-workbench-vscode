import * as vscode from 'vscode';
import * as path from 'path';
import { readdirSync, unlinkSync } from 'fs';
import { FileProvider } from '../../utils/files/fileProvider';
import { StateManager } from '../../workbench/stateManager';

export const activateExtension = async () => {
    return new Promise<void>(async (resolve) => {
        let extension = vscode.extensions.getExtension('ApolloGraphQL.apollo-workbench-vscode');
        if (extension) {
            await extension.activate();
        }
        resolve();
    });
}

export function cleanupWorkbenchFiles() {
    try {
        const directory = path.resolve(__dirname, '..', './test-workbench');
        const dirents = readdirSync(directory, { withFileTypes: true });
        for (const dirent of dirents) {
            if (dirent.isFile() && dirent.name.includes('.apollo-workbench'))
                unlinkSync(path.resolve(directory, dirent.name));
        }
    } catch (err) {
        console.log(err);
    }
    FileProvider.instance.workbenchFiles.clear();
    if (StateManager.instance.context)
        StateManager.instance.context.workspaceState.update("selectedWbFile", "");
}


export async function createAndLoadEmptyWorkbenchFile() {
    const workbenchFileName = 'empty-workbench';
    const workbenchFilePath = FileProvider.instance.createNewWorkbenchFile(workbenchFileName);
    if (!workbenchFilePath) throw new Error('Workbench file was not created');

    await FileProvider.instance.loadWorkbenchFile(workbenchFileName, workbenchFilePath);
}