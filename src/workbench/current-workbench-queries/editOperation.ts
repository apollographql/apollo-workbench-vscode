import * as vscode from 'vscode';

import { outputChannel } from '../../extension';
import { workspaceQueriesFolderPath } from '../../helpers';
import { WorkbenchOperationTreeItem } from './currentWorkbenchOpsTreeDataProvider';

export const editOperation = async (item: WorkbenchOperationTreeItem) => {
    outputChannel.appendLine(`Selected Operation ${item.graphVariant}`);
    const workbenchQueriesFolder = workspaceQueriesFolderPath();
    const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${item.graphVariant}.graphql`);
    await vscode.window.showTextDocument(uri);
}