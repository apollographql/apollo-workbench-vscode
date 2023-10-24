import { FileProvider } from '../workbench/file-system/fileProvider';
import { window } from 'vscode';
import { getFileName } from '../utils/path';
import { StudioOperationTreeItem } from '../workbench/tree-data-providers/tree-items/graphos-operations/studioOperationTreeItem';

export async function addToDesign(op: StudioOperationTreeItem) {
  const supergraphs = FileProvider.instance.getWorkbenchFiles();
  const supergraphNames: { [subgraphName: string]: string } = {};
  supergraphs.forEach((wbFile, wbFilePath) => {
    const subgraphName = getFileName(wbFilePath);
    supergraphNames[subgraphName] = wbFilePath;
  });

  const supergraphToAddOperationTo = await window.showQuickPick(
    Object.keys(supergraphNames),
    {
      placeHolder: 'Select the design to add the operation to',
    },
  );
  if (supergraphToAddOperationTo) {
    const wbFilePath = supergraphNames[supergraphToAddOperationTo];
    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
    if (wbFile) {
      wbFile.operations[op.operationName] = {
        document: op.operationSignature,
      };

      await FileProvider.instance.writeWorkbenchConfig(
        supergraphNames[supergraphToAddOperationTo],
        wbFile,
      );
    }
  }
}
