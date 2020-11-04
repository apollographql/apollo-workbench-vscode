import * as vscode from 'vscode';
import { outputChannel } from "../../extension";
import { CurrentWorkbenchSchemasTreeDataProvider } from '../current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { WorkbenchFile, WorkbenchFileTreeItem } from "./localWorkbenchFilesTreeDataProvider";

export const loadFile = (item: WorkbenchFileTreeItem, context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchSchemasTreeDataProvider) => {
    outputChannel.appendLine(`Loading WB:${item.graphVariant} - ${item.filePath}`);
    context.workspaceState.update("selectedWbFile", { name: item.graphVariant, path: item.filePath } as WorkbenchFile);
    currentWorkbenchProvider.refresh();
}