import * as vscode from 'vscode';
import { outputChannel } from "../../extension";
import { CurrentWorkbenchTreeDataProvider } from '../current-workbench/currentWorkbenchTreeDataProvider';
import { WorkbenchFile, WorkbenchFileTreeItem } from "./localWorkbenchFilesTreeDataProvider";

export const loadFile = (item: WorkbenchFileTreeItem, context: vscode.ExtensionContext, currentWorkbenchProvider: CurrentWorkbenchTreeDataProvider) => {
    outputChannel.appendLine(`Loading WB:${item.label} - ${item.filePath}`);
    context.workspaceState.update("selectedWbFile", { name: item.label, path: item.filePath } as WorkbenchFile);
    currentWorkbenchProvider.refresh();
}