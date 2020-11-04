import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { getSelectedWorkbenchFile, saveSelectedWorkbenchFile } from '../../helpers';
import { CurrentWorkbenchOpsTreeDataProvider } from './currentWorkbenchOpsTreeDataProvider';

export const createOperation = async (context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchOpsTreeDataProvider) => {
    let operationName = await vscode.window.showInputBox({ placeHolder: "Enter a operation name for the query or mutation" }) ?? "";
    if (!operationName) {
        outputChannel.appendLine(`Create operation cancelled - No name entered.`);
    } else {
        let wb = getSelectedWorkbenchFile(context);
        if (wb) {
            while (wb?.schemas[operationName]) {
                outputChannel.appendLine(`${operationName} already exists. Schema/Service name must be unique within a workbench file`);
                operationName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
            }

            wb.operations[operationName] = `query ${operationName} {\n\n}`;
            wb.queryPlans[operationName] = "";

            saveSelectedWorkbenchFile(wb, context);
            currentWorkbenchProvider.refresh();
        }
    }
}