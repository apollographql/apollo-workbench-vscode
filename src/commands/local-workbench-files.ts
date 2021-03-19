import { FileProvider } from "../workbench/file-system/fileProvider";
import { WorkbenchFileTreeItem } from "../workbench/tree-data-providers/localWorkbenchFilesTreeDataProvider";
import { window, ProgressLocation } from "vscode";
import { StateManager } from "../workbench/stateManager";
import { createTypescriptTemplate } from "../utils/export-project/createTypescriptTemplate";

export async function deleteFile(item: WorkbenchFileTreeItem) {
    await FileProvider.instance.promptToDeleteWorkbenchFile(item.filePath);
}

export async function duplicateFile(item: WorkbenchFileTreeItem) {
    await FileProvider.instance.duplicateWorkbenchFile(item.graphName, item.filePath);
}

export async function exportProject(item: WorkbenchFileTreeItem) {
    let workbenchFile = FileProvider.instance.workbenchFiles.get(item.filePath);
    if (workbenchFile) {

        let exportLanguage = await window.showQuickPick(["Javascript", "Typescript"], { canPickMany: false, placeHolder: "Would you like to use Javascript or Typescript for the exported project?" });
        if (exportLanguage == "Typescript") {
            createTypescriptTemplate(workbenchFile);
        } else {
            createTypescriptTemplate(workbenchFile);
        }
    }
}

export async function loadFile(item: WorkbenchFileTreeItem) {
    window.withProgress({ location: ProgressLocation.Notification, title: 'Loading Workbench File', cancellable: false }, () => FileProvider.instance.loadWorkbenchFile(item.graphName, item.filePath))
}

export function refresh() {
    StateManager.instance.localWorkbenchFilesProvider.refresh();
}
export async function renameGraph(item: WorkbenchFileTreeItem) {
    await FileProvider.instance.promptToRenameWorkbenchFile(item.graphName, item.filePath);
}