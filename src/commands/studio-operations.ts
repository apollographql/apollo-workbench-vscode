import { StudioOperationTreeItem } from "../workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider";
import { FileProvider } from "../utils/files/fileProvider";

export async function addToWorkbench(op: StudioOperationTreeItem) {
    await FileProvider.instance.addOperation(op.operationName, op.operationSignature);
}