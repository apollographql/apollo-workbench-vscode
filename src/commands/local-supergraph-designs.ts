import {
  FileProvider,
  schemaFileUri,
  tempSchemaFilePath,
} from '../workbench/file-system/fileProvider';
import {
  window,
  Uri,
  workspace,
  TextDocument,
  commands,
  Position,
  SnippetString,
  Range,
  ProgressLocation,
} from 'vscode';
import { StateManager } from '../workbench/stateManager';
import {
  SubgraphTreeItem,
  SubgraphSummaryTreeItem,
  SupergraphTreeItem,
} from '../workbench/tree-data-providers/superGraphTreeDataProvider';
import {
  WorkbenchUri,
  WorkbenchUriType,
} from '../workbench/file-system/WorkbenchUri';
import {
  StudioGraphVariantTreeItem,
  StudioGraphTreeItem,
  PreloadedWorkbenchFile,
} from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { ApolloWorkbenchFile } from '../workbench/file-system/fileTypes';
import { getGraphSchemasByVariant } from '../graphql/graphClient';
import { GetGraphSchemas_service_implementingServices_FederatedImplementingServices } from '../graphql/types/GetGraphSchemas';
import { join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { visit, print } from 'graphql';
import { log } from '../utils/logger';
import gql from 'graphql-tag';
import { ApolloConfig } from '../workbench/file-system/ApolloConfig';
import { Rover } from '../workbench/rover';
import { getFileName } from '../utils/path';
import { TextEncoder } from 'util';
import { dump } from 'js-yaml';

export async function editSubgraph(item: SubgraphTreeItem) {
  const wbFilePath = item.wbFilePath;
  const subgraphName = item.subgraphName;

  try {
    await FileProvider.instance.load(wbFilePath, false);
    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
    const subgraphSchemaConfig = wbFile.subgraphs[subgraphName]?.schema;
    if (subgraphSchemaConfig?.file) {
      await window.showTextDocument(
        schemaFileUri(subgraphSchemaConfig.file, wbFilePath),
      );
    } else if (subgraphSchemaConfig.workbench_design) {
      await window.showTextDocument(
        schemaFileUri(subgraphSchemaConfig.workbench_design, wbFilePath),
      );
    } else {
      const tempLocation = tempSchemaFilePath(wbFilePath, subgraphName);
      if (existsSync(tempLocation.fsPath))
        await window.showTextDocument(tempLocation);

      await window.withProgress(
        { location: ProgressLocation.Notification },
        async (progress) => {
          progress.report({
            message: `Getting remote schema updates and writing to temp folder...`,
          });

          const tempUri = await FileProvider.instance.writeTempSchemaFile(
            wbFilePath,
            subgraphName,
          );
          if (tempUri)
            window
              .showInformationMessage(
                `You are opening a schema file  that lives in a remote source and any edits you make won't be reflected in your design. Would you like to change this schema to a local design file?`,
                'Convert to local design',
              )
              .then(async (value) => {
                if (
                  StateManager.workspaceRoot &&
                  value == 'Convert to local design'
                ) {
                  //We need to create the file in the relative workspace
                  const schemaFilePath = resolve(
                    StateManager.workspaceRoot,
                    `${subgraphName}.graphql`,
                  );
                  const schemaFileUri = Uri.parse(schemaFilePath);
                  await workspace.fs.copy(tempLocation, schemaFileUri, {
                    overwrite: true,
                  });
                  await FileProvider.instance.convertSubgraphToDesign(
                    wbFilePath,
                    subgraphName,
                    schemaFilePath,
                  );

                  commands.executeCommand('vscode.open', schemaFileUri);
                }
              });
        },
      );
    }
  } catch (err: any) {
    log(err);
  }
}

export async function viewSubgraphSettings(item: SubgraphTreeItem) {
  await window.showTextDocument(Uri.parse(item.wbFilePath));
}

export async function viewSupergraphSchema(item: SupergraphTreeItem) {
  const supergraphSDL =
    await FileProvider.instance.refreshWorkbenchFileComposition(item.filePath);
  if (supergraphSDL) {
    const doc = await workspace.openTextDocument({
      content: supergraphSDL,
      language: 'graphql',
    });

    await window.showTextDocument(doc);
  } else {
    window.showErrorMessage(
      'You have composition errors that need to be resolved',
    );
    commands.executeCommand('workbench.panel.markers.view.focus');
  }
}
export function refreshSupergraphs() {
  StateManager.instance.localSupergraphTreeDataProvider.refresh();
}
export async function addSubgraph(item: SubgraphSummaryTreeItem) {
  const subgraphName =
    (await window.showInputBox({
      placeHolder: 'Enter a unique name for the subgraph',
    })) ?? '';
  if (!subgraphName) {
    const message = `Create schema cancelled - No name entered.`;
    log(message);
    window.setStatusBarMessage(message, 3000);
  } else {
    const root = StateManager.workspaceRoot;
    if (root) {
      const newSchemaFilePath = resolve(root, `${subgraphName}.graphql`);
      await workspace.fs.writeFile(
        Uri.parse(newSchemaFilePath),
        Buffer.from(
          'extend schema \n\t@link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])\n\ntype Query { \n\tdesignRoot: String\n}',
        ),
      );
      const wbFile = FileProvider.instance.workbenchFileFromPath(item.filePath);
      wbFile.subgraphs[subgraphName] = {
        name: subgraphName,
        schema: {
          file: newSchemaFilePath,
        },
      };
      await FileProvider.instance.writeWorkbenchConfig(item.filePath, wbFile);
    }
  }
}
export async function deleteSubgraph(item: SubgraphTreeItem) {
  const subgraphName = item.subgraphName;
  const wbFile = FileProvider.instance.workbenchFileFromPath(item.wbFilePath);
  delete wbFile.subgraphs[subgraphName];
  await FileProvider.instance.writeWorkbenchConfig(item.wbFilePath, wbFile);
}
export async function newDesign() {
  if (!StateManager.workspaceRoot) {
    await promptOpenFolder();
  } else {
    const workbenchName = await window.showInputBox({
      placeHolder: 'Enter name for workbench file',
    });
    if (!workbenchName) {
      const msg =
        'No name was provided for the file.\n Cancelling new workbench create';
      log(msg);
      window.showErrorMessage(msg);
    } else {
      await FileProvider.instance.createWorkbenchFileLocally(
        workbenchName,
        new ApolloConfig(),
      );
    }
  }
}

export async function createWorkbenchFromSupergraphVariant(
  graphVariantTreeItem: StudioGraphVariantTreeItem,
) {
  if (!StateManager.workspaceRoot) {
    await promptOpenFolder();
  } else {
    await createWorkbench(
      graphVariantTreeItem.graphId,
      graphVariantTreeItem.graphVariant,
    );
  }
}

export async function createWorkbenchFromSupergraph(
  graphVariantTreeItem: StudioGraphTreeItem,
  selectedVariant?: string,
) {
  if (!StateManager.workspaceRoot) {
    await promptOpenFolder();
  } else {
    const graphId = graphVariantTreeItem.graphId;
    const graphVariants = graphVariantTreeItem.variants;
    if (!selectedVariant) {
      if (graphVariants.length == 0) {
        selectedVariant = 'currrent';
      } else if (graphVariants.length == 1) {
        selectedVariant = graphVariants[0];
      } else {
        selectedVariant = (await window.showQuickPick(graphVariants)) ?? '';
      }
    }

    if (selectedVariant == '') {
      window.showInformationMessage(
        'You must select a variant to load the graph from',
      );
    } else {
      await createWorkbench(graphId, selectedVariant);
    }
  }
}
async function createWorkbench(graphId: string, selectedVariant: string) {
  const defaultGraphName = `${graphId}-${selectedVariant}-`;
  const graphName = await window.showInputBox({
    prompt: 'Enter a name for your new workbench file',
    placeHolder: defaultGraphName,
    value: defaultGraphName,
  });
  if (graphName) {
    const workbenchFile: ApolloConfig = new ApolloConfig();

    const results = await getGraphSchemasByVariant(
      StateManager.instance.globalState_userApiKey,
      graphId,
      selectedVariant,
    );
    //Create YAML from config

    const implementingServices = results.service
      ?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;
    implementingServices?.services?.map(
      (service) =>
        (workbenchFile.subgraphs[service.name] = {
          name: service.name,
          routing_url: service.url ?? '',
          schema: {
            graphref: `${graphId}@${selectedVariant}`,
            subgraph: service.name,
          },
        }),
    );

    await FileProvider.instance.createWorkbenchFileLocally(
      graphName,
      workbenchFile,
    );
  } else {
    window.showInformationMessage(
      'You must provide a name to create a new workbench file',
    );
  }
}

export async function exportSupergraphSchema(item: SupergraphTreeItem) {
  if (StateManager.workspaceRoot) {
    const exportPath = resolve(
      StateManager.workspaceRoot,
      `${getFileName(item.filePath)}-supergraph-schema.graphql`,
    );
    await Rover.instance.writeSupergraphSDL(item.filePath, exportPath);
  }
}

export async function createWorkbenchFromPreloaded(
  preloadedItem: PreloadedWorkbenchFile,
) {
  if (!StateManager.workspaceRoot) {
    await promptOpenFolder();
  } else {
    const preloadFileDir = join(
      __dirname,
      '..',
      '..',
      'media',
      `preloaded-files`,
      `${preloadedItem.fileName}.apollo-workbench`,
    );
    const fileContent = readFileSync(preloadFileDir, { encoding: 'utf-8' });
    const workbenchFile = JSON.parse(fileContent) as ApolloWorkbenchFile;

    // FileProvider.instance.createWorkbenchFileLocally(workbenchFile);
  }
}

export async function promptOpenFolder() {
  const openFolder = 'Open Folder';
  const response = await window.showErrorMessage(
    'You must open a folder to create Apollo Workbench files',
    openFolder,
  );
  if (response == openFolder)
    await commands.executeCommand('extension.openFolder');
}

export async function addFederationDirective(
  directive: string,
  document: TextDocument,
) {
  let addedDirective = false;
  const ast = gql(document.getText());
  visit(ast, {
    SchemaExtension(node) {
      const linkDirective = node.directives?.find(
        (d) => d.name.value == 'link',
      );
      if (linkDirective) {
        const importArg = linkDirective.arguments?.find(
          (a) => a.name.value == 'import',
        );
        if (importArg) {
          (importArg.value as any).values.push({
            block: false,
            kind: 'StringValue',
            value: directive,
          });
          addedDirective = true;
        }
      }
    },
  });

  const editor = window.activeTextEditor;
  if (addedDirective) {
    await editor?.edit((editBuilder) => {
      editBuilder.delete(
        new Range(new Position(0, 0), new Position(document.lineCount, 0)),
      );
      editBuilder.insert(new Position(0, 0), print(ast));
    });
  } else {
    await editor?.insertSnippet(
      new SnippetString(
        `extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["${directive}"])\n\n`,
      ),
      new Position(0, 0),
    );
  }

  // await document.save();
}
