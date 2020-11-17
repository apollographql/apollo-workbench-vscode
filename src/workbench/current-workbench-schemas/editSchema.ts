import * as vscode from 'vscode';
import { mkdirSync, existsSync, writeFileSync } from 'fs';

import { outputChannel } from '../../extension';
import { WorkbenchSchemaTreeItem } from './currentWorkbenchSchemasTreeDataProvider';
import { FileWatchManager } from '../fileWatchManager';
import { WorkbenchFileManager } from '../workbenchFileManager';

export const editSchema = async (item: WorkbenchSchemaTreeItem) => {
    outputChannel.appendLine(`Selected Schema ${item.serviceName}`);
    if (vscode.workspace.workspaceFolders) {
        const workbenchSchemasFolder = WorkbenchFileManager.workbenchSchemasFolderPath();

        if (!existsSync(workbenchSchemasFolder))
            await mkdirSync(workbenchSchemasFolder);

        const uri = vscode.Uri.parse(`${workbenchSchemasFolder}/${item.serviceName}.graphql`);

        if (!existsSync(`${workbenchSchemasFolder}/${item.serviceName}.graphql`))
            await writeFileSync(`${workbenchSchemasFolder}/${item.serviceName}.graphql`, JSON.stringify(item.schema), { encoding: 'utf-8' });

        await vscode.window.showTextDocument(uri);
    }
}