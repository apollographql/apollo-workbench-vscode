import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { getSelectedWorkbenchFile, saveSelectedWorkbenchFile } from '../../helpers';
import { CurrentWorkbenchSchemasTreeDataProvider } from './currentWorkbenchSchemasTreeDataProvider';

export const createSchemaFile = async (context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchSchemasTreeDataProvider) => {
    let wb = getSelectedWorkbenchFile(context);
    if (!wb) {
        outputChannel.appendLine(`Unable to create new schema; no workbench file is currently loaded.`);
        vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
    } else {
        let schemaName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!schemaName) {
            outputChannel.appendLine(`Create schema cancelled - No name entered.`);
        } else {
            while (wb.schemas[schemaName]) {
                outputChannel.appendLine(`${schemaName} already exists. Schema/Service name must be unique within a workbench file`);
                schemaName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
            }

            wb.schemas[schemaName] = "";
            saveSelectedWorkbenchFile(wb, context);
            currentWorkbenchProvider.refresh();
        }
    }
}