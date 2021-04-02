import { StudioOperationTreeItem } from "../workbench/tree-data-providers/apolloStudioGraphOpsTreeDataProvider";
import { FileProvider } from "../workbench/file-system/fileProvider";
import { window } from "vscode";
import { StateManager } from "../workbench/stateManager";
import { parse } from "graphql";
import { print } from "graphql";

export async function addToWorkbench(op: StudioOperationTreeItem) {
    let supergraphNames: string[] = [];
    FileProvider.instance.workbenchFiles.forEach(wbFile => supergraphNames.push(wbFile.graphName));

    let supergraphToAddOperationTo = await window.showQuickPick(supergraphNames, { placeHolder: "Select the Supergraph to add the operation to" });
    if (supergraphToAddOperationTo) {
        let wbFile = Array.from(FileProvider.instance.workbenchFiles.values()).find(wb => wb.graphName == supergraphToAddOperationTo);
        if (wbFile) {
            let wbPath = '';
            Array.from(FileProvider.instance.workbenchFiles.keys()).forEach(path => {
                const wb = FileProvider.instance.workbenchFiles.get(path);
                if (wb?.graphName == supergraphToAddOperationTo && supergraphToAddOperationTo) wbPath = path;
            })

            wbFile.operations[op.operationName] = print(parse(op.operationSignature));
            FileProvider.instance.saveWorkbenchFile(wbFile, wbPath);
        }
    }
}