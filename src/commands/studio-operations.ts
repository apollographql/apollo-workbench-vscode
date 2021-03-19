import { StudioOperationTreeItem } from "../workbench/tree-data-providers/apolloStudioGraphOpsTreeDataProvider";
import { FileProvider } from "../workbench/file-system/fileProvider";

export async function addToWorkbench(op: StudioOperationTreeItem) {
    await FileProvider.instance.addOperation(op.operationName, op.operationSignature);
}