import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { FileWatchManager } from '../fileWatchManager';
import { WorkbenchFileManager } from '../workbenchFileManager';
import { CurrentWorkbenchSchemasTreeDataProvider } from './currentWorkbenchSchemasTreeDataProvider';

export const deleteSchemaFile = async (serviceName: string, context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchSchemasTreeDataProvider) => {
    let wb = WorkbenchFileManager.getSelectedWorkbenchFile();
    if (!wb) {
        outputChannel.appendLine(`Unable to create new schema; no workbench file is currently loaded.`);
        vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
    } else {
        delete wb.schemas[serviceName]
        WorkbenchFileManager.saveSelectedWorkbenchFile(wb);
        currentWorkbenchProvider.refresh();
    }
}