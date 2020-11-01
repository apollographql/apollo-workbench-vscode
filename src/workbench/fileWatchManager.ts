import * as vscode from 'vscode';
const chokidar = require('chokidar');
import { deleteSchema, setupMocks, addSchema, updateSchema } from '../workbench/setup';

export class FileWatchManager {
    private watcher = chokidar.watch();

    start(context: vscode.ExtensionContext) {
        const currentFolder = `${(vscode.workspace.workspaceFolders as any)[0].uri.fsPath}`;
        this.watcher.add(`${currentFolder}/.workbench-schemas`)
            .on('ready', (path: any) => setupMocks(context))
            .on('change', (path) => updateSchema(path, context))
            .on('unlink', (path: any) => deleteSchema(path, context))
            .on('add', (path: any) => addSchema(path, context));
    }

    async reset() {
        if (this.watcher?._eventsCount > 0)
            await this.watcher.close();

        this.watcher = chokidar.watch();
    }
}