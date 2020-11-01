import * as vscode from 'vscode';
import { mkdirSync, existsSync, writeFileSync } from 'fs';

import { outputChannel } from '../../extension';
import { workspaceSchemasFolder } from '../../helpers';
import { WorkbenchSchemaTreeItem } from './currentWorkbenchTreeDataProvider';

export const editSchema = async (item: WorkbenchSchemaTreeItem) => {
    outputChannel.appendLine(`Selected ${item.label}`);
    if (vscode.workspace.workspaceFolders) {
        const workbenchSchemasFolder = workspaceSchemasFolder();

        if (!existsSync(workbenchSchemasFolder))
            await mkdirSync(workbenchSchemasFolder);

        const uri = vscode.Uri.parse(`${workbenchSchemasFolder}/${item.label}.graphql`);

        if (!existsSync(`${workbenchSchemasFolder}/${item.label}.graphql`))
            await writeFileSync(`${workbenchSchemasFolder}/${item.label}.graphql`, JSON.stringify(item.schema), { encoding: 'utf-8' });

        await vscode.window.showTextDocument(uri);
    }
}