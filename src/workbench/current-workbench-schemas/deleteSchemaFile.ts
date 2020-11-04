import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { getSelectedWorkbenchFile, getWorkbenchFile, saveSelectedWorkbenchFile, saveWorkbenchFile } from '../../helpers';
import { WorkbenchFile } from '../local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { CurrentWorkbenchSchemasTreeDataProvider } from './currentWorkbenchSchemasTreeDataProvider';

export const deleteSchemaFile = async (serviceName: string, context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchSchemasTreeDataProvider) => {
    let wb = getSelectedWorkbenchFile(context);
    if (!wb) {
        outputChannel.appendLine(`Unable to create new schema; no workbench file is currently loaded.`);
        vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
    } else {
        delete wb.schemas[serviceName]
        saveSelectedWorkbenchFile(wb, context);
        currentWorkbenchProvider.refresh();
    }
}