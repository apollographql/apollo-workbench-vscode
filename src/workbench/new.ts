import * as vscode from 'vscode';
import { writeFileSync } from 'fs';

import { ApolloWorkbench, outputChannel } from '../extension';
import { LocalWorkbenchFilesTreeDataProvider as LocalWorkbenchFilesTreeDataProvider } from './local-workbench-files/localWorkbenchFilesTreeDataProvider';

export const newWorkbench = async (localWorkbenchFilesProvider: LocalWorkbenchFilesTreeDataProvider) => {
    outputChannel.appendLine('Creating new workbench file...');

    let workbenchName = await vscode.window.showInputBox({ placeHolder: "Enter name for workbench file" });
    if (!workbenchName) {
        const msg = 'No name was provided for the file.\n Cancelling new workbench create';
        outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg);
    } else {
        const workbenchFile = `${vscode.workspace.rootPath}/${workbenchName}.apollo-workbench`;
        let workbenchMaster: ApolloWorkbench = {
            queries: {},
            schemas: {},
            composedSchema: '',
            graphName: workbenchFile
        }

        outputChannel.appendLine(`Creating ${workbenchFile}`);
        writeFileSync(workbenchFile, JSON.stringify(workbenchMaster));
        localWorkbenchFilesProvider.refresh();
    }
}