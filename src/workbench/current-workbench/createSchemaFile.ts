import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { getWorkbenchFile, saveWorkbenchFile } from '../../helpers';
import { WorkbenchFile } from '../local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { CurrentWorkbenchTreeDataProvider } from './currentWorkbenchTreeDataProvider';

export const createSchemaFile = async (context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchTreeDataProvider) => {
    let wbFile = context.workspaceState.get("selectedWbFile") as WorkbenchFile;
    if (!wbFile) {
        outputChannel.appendLine(`Unable to create new schema; no workbench file is currently loaded.`);
        vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
    } else {
        let schemaName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!schemaName) {
            outputChannel.appendLine(`Create schema cancelled - No name entered.`);
        } else {
            let wb = getWorkbenchFile(wbFile.path);
            while (wb.schemas[schemaName]) {
                outputChannel.appendLine(`${schemaName} already exists. Schema/Service name must be unique within a workbench file`);
                schemaName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
            }

            wb.schemas[schemaName] = "";
            saveWorkbenchFile(wb, wbFile.path);
            currentWorkbenchProvider.refresh();
        }
    }
}