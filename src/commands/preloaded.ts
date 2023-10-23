import { ProgressLocation, Uri, commands, window, workspace } from 'vscode';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { PreloadedSubgraph } from '../workbench/tree-data-providers/tree-items/graphos-supergraphs/preloadedSubgraph';
import { resolve } from 'path';
import {
  ApolloRemoteSchemaProvider,
  PreloadedSchemaProvider,
} from '../workbench/docProviders';
import { StateManager } from '../workbench/stateManager';

export async function viewPreloadedSchema(item: PreloadedSubgraph) {
  await PreloadedSchemaProvider.Open(item.wbFilePath, item.subgraphName);
  await window
    .showInformationMessage(
      `You are opening an example design that will be read-only. Would you like to copy the design locally to edit?`,
      'Copy design',
    )
    .then(async (value) => {
      if (value == 'Copy design') {
        const root = StateManager.workspaceRoot;
        if (root) {
          const wbFileUri = Uri.parse(item.wbFilePath);
          const schemasFolder = Uri.parse(
            `${item.wbFilePath.split('.yaml')[0]}-schemas`,
          );

          await workspace.fs.copy(
            wbFileUri,
            Uri.parse(resolve(root, `${item.wbFileName}.yaml`)),
          );
          await workspace.fs.copy(
            schemasFolder,
            Uri.parse(resolve(root, `${item.wbFileName}-schemas`)),
          );
          StateManager.instance.localSupergraphTreeDataProvider.refresh();
          commands.executeCommand(
            'vscode.open',
            Uri.parse(
              resolve(
                root,
                `${item.wbFileName}-schemas`,
                `${item.subgraphName}.graphql`,
              ),
            ),
          );
          commands.executeCommand('workbench.action.closeActiveEditor');
        }
      }
    });
}
