import { FileProvider, WorkbenchUri, WorkbenchUriType } from "../utils/files/fileProvider";
import { WorkbenchOperationTreeItem } from "../workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider";
import { StudioOperationTreeItem } from "../workbench/studio-operations/apolloStudioGraphOpsTreeDataProvider";
import { StateManager } from "../workbench/stateManager";

export async function addOperation() {
    await FileProvider.instance.promptToAddOperation()
}

export async function deleteOperation(operation: WorkbenchOperationTreeItem) {
    await FileProvider.instance.delete(WorkbenchUri.parse(operation.operationName, WorkbenchUriType.QUERIES), { recursive: true });
}

export async function editOperation(operation: WorkbenchOperationTreeItem) {
    await FileProvider.instance.openOperation(operation.operationName)
}

export async function openQueryPlan(op: StudioOperationTreeItem) {
    await FileProvider.instance.openOperationQueryPlan(op.operationName);
}

export function refreshOperations() {
    StateManager.instance.currentWorkbenchOperationsProvider.refresh();
}