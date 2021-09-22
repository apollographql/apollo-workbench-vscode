import { StudioOperationTreeItem } from '../workbench/tree-data-providers/apolloStudioGraphOpsTreeDataProvider';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { window } from 'vscode';
import { parse } from 'graphql';
import { print } from 'graphql';
import {
  WorkbenchUri,
  WorkbenchUriType,
} from '../workbench/file-system/WorkbenchUri';

export async function addToWorkbench(op: StudioOperationTreeItem) {
  const supergraphs = FileProvider.instance.getWorkbenchFiles();
  const supergraphNames: string[] = [];
  supergraphs.forEach((wbFile) => supergraphNames.push(wbFile.graphName));

  const supergraphToAddOperationTo = await window.showQuickPick(
    supergraphNames,
    {
      placeHolder: 'Select the Supergraph to add the operation to',
    },
  );
  if (supergraphToAddOperationTo) {
    const wbFile = Array.from(supergraphs.values()).find(
      (wb) => wb.graphName == supergraphToAddOperationTo,
    );
    if (wbFile) {
      let wbPath = '';
      Array.from(supergraphs.keys()).forEach((path) => {
        const wb = FileProvider.instance.workbenchFileFromPath(path);
        if (
          wb?.graphName == supergraphToAddOperationTo &&
          supergraphToAddOperationTo
        )
          wbPath = path;
      });

      const operation = print(parse(op.operationSignature));
      FileProvider.instance.writeFile(
        WorkbenchUri.supergraph(
          wbPath,
          op.operationName,
          WorkbenchUriType.QUERIES,
        ),
        Buffer.from(operation),
        { create: true, overwrite: true },
      );
    }
  }
}
