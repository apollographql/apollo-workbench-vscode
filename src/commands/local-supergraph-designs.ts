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
  ViewColumn,
} from 'vscode';
import { StateManager } from '../workbench/stateManager';
import {
  SubgraphTreeItem,
  SubgraphSummaryTreeItem,
  SupergraphTreeItem,
  OperationTreeItem,
  AddDesignOperationTreeItem,
} from '../workbench/tree-data-providers/superGraphTreeDataProvider';
import {
  StudioGraphVariantTreeItem,
  StudioGraphTreeItem,
  PreloadedWorkbenchFile,
} from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { getGraphSchemasByVariant } from '../graphql/graphClient';
import { join, resolve } from 'path';
import { readFileSync } from 'fs';
import { visit, print } from 'graphql';
import { log } from '../utils/logger';
import gql from 'graphql-tag';
import { ApolloConfig, Subgraph } from '../workbench/file-system/ApolloConfig';
import { Rover } from '../workbench/rover';
import { getFileName } from '../utils/path';
import { WorkbenchDiagnostics } from '../workbench/diagnosticsManager';
import { viewOperationDesign } from '../workbench/webviews/operationDesign';
import { ApolloRemoteSchemaProvider } from '../workbench/docProviders';

let startingMocks = false;

export async function viewOperationDesignSideBySide(item: OperationTreeItem) {
  const uri = await FileProvider.instance.writeTempOperationFile(
    item.wbFilePath,
    item.operationName,
  );
  if (item.wbFile.operations[item.operationName].ui_design) {
    viewOperationDesign(item);

    await window.showTextDocument(uri, {
      viewColumn: ViewColumn.Two,
    });
  } else {
    await window.showTextDocument(uri);
  }
}

export async function mockSubgraph(item: SubgraphTreeItem) {
  await FileProvider.instance.convertSubgraphToDesign(
    item.wbFilePath,
    item.subgraphName,
  );
}

export async function stopRoverDevSession(item: SubgraphSummaryTreeItem) {
  await Rover.instance.stopRoverDev();
  window.showInformationMessage('Rover dev stopped');
}

export async function startRoverDevSession(item: SubgraphSummaryTreeItem) {
  if (startingMocks) return;
  startingMocks = true;

  //Check for composition errors
  let errors = 0;
  WorkbenchDiagnostics.instance.diagnosticCollections
    .get(item.filePath)
    ?.compositionDiagnostics.forEach(() => errors++);

  if (errors == 0) {
    try {
      await window.withProgress(
        {
          title: `Starting rover dev session`,
          cancellable: false,
          location: ProgressLocation.Notification,
        },
        async (progress) => {
          //Calculate how many servers to mock
          const subgraphNames = Object.keys(item.wbFile.subgraphs);
          const subgraphsToMock: { [name: string]: Subgraph } = {};
          subgraphNames.forEach((s) => {
            if (item.wbFile.subgraphs[s].schema.workbench_design)
              subgraphsToMock[s] = item.wbFile.subgraphs[s];
          });
          const subgraphNamesToMock = Object.keys(subgraphsToMock);
          const numberOfSubgraphsToMock = subgraphNamesToMock.length;
          const increment =
            100 / (numberOfSubgraphsToMock + subgraphNames.length);

          //Mock any subgraphs we need to
          if (numberOfSubgraphsToMock > 0) {
            progress.report({
              message: `${numberOfSubgraphsToMock} Subgraphs to mock`,
            });
            for (let i = 0; i < numberOfSubgraphsToMock; i++) {
              const subgraphName = subgraphNamesToMock[i];
              const subgraph = subgraphsToMock[subgraphName];
              const schemaPath =
                subgraph.schema.workbench_design ?? subgraph.schema.file ?? '';
              const url = await Rover.instance.startMockedSubgraph(
                subgraphName,
                Uri.parse(schemaPath),
              );

              if (url)
                progress.report({
                  message: `Mocked subgraph ${subgraphName} at ${url}`,
                  increment,
                });
              else
                progress.report({
                  message: `Unable to mock subgraph ${subgraphName}`,
                  increment,
                });
            }
          }

          //Start rover dev sessions
          const roverPromises: Promise<void>[] = [];
          for (let i = 0; i < subgraphNames.length; i++) {
            const subgraphName = subgraphNames[i];
            const subgraph = item.wbFile.subgraphs[subgraphName];
            const routingUrl = subgraph.schema.workbench_design
              ? `http://localhost:${Rover.instance.portMapping[subgraphName]}`
              : subgraph.routing_url ??
                subgraph.schema.subgraph_url ??
                'http://unable-to-get-url.com';
            let schemaPath =
              subgraph.schema.workbench_design ?? subgraph.schema.file;

            const prom = new Promise<void>((resolve, reject) => {
              setTimeout(async () => {
                if (!schemaPath) {
                  const tempUri =
                    await FileProvider.instance.writeTempSchemaFile(
                      item.filePath,
                      subgraphName,
                    );
                  schemaPath = tempUri?.fsPath;
                }

                Rover.instance.startRoverDevSession(
                  subgraphName,
                  routingUrl,
                  schemaPath,
                );

                progress.report({
                  message: `${subgraphName}`,
                  increment,
                });

                resolve();
              });
            });

            roverPromises.push(prom);
          }

          await Promise.all(roverPromises);

          startingMocks = false;
          Rover.instance.primaryDevTerminal?.show();
          await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          progress.report({
            message: 'Opening Sandbox',
          });
          await commands.executeCommand('local-supergraph-designs.sandbox');
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
        },
      );
    } catch (err) {
      startingMocks = false;
    }
  } else {
    commands.executeCommand('workbench.action.showErrorsWarnings');
    window.showErrorMessage('Unable to start design due to composition errors');
  }

  startingMocks = false;
}

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
      const tempLocation = ApolloRemoteSchemaProvider.Uri(
        wbFilePath,
        subgraphName,
      );
      await window.withProgress(
        { location: ProgressLocation.Notification },
        async (progress) => {
          progress.report({
            message: `Getting remote schema updates and writing to temp folder...`,
          });

          await window.showTextDocument(tempLocation);
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
                await workspace.fs.copy(
                  tempSchemaFilePath(wbFilePath, subgraphName),
                  schemaFileUri,
                  {
                    overwrite: true,
                  },
                );
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
    await FileProvider.instance.refreshWorkbenchFileComposition(
      item.wbFilePath,
    );
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

export async function addOperation(
  item: OperationTreeItem | AddDesignOperationTreeItem,
) {
  const operationName = await window.showInputBox({
    title: 'Define Operation Name',
  });
  if (operationName) {
    item.wbFile.operations[operationName] = {
      document: `query ${operationName} {\n\tthing: String\n}`,
    };

    const uiDesign = await window.showQuickPick(['Yes', 'No'], {
      title: 'Would you like to add a UI design?',
    });
    if (uiDesign?.toLocaleLowerCase() == 'yes') {
      const uiDesign = await window.showInputBox({
        title: 'Enter the file path or remote url where the UI design image is',
        prompt:
          'https://my-website.com/images/a.png or /Users/Me/Desktop/a.png',
      });
      if (uiDesign) item.wbFile.operations[operationName].ui_design = uiDesign;
    }

    await FileProvider.instance.writeWorkbenchConfig(
      item.wbFilePath,
      item.wbFile,
    );
  }
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

    const results = await getGraphSchemasByVariant(graphId, selectedVariant);
    //Create YAML from config

    results.graph?.variant?.subgraphs?.map(
      (service) =>
        (workbenchFile.subgraphs[service.name] = {
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
      `${getFileName(item.wbFilePath)}-supergraph-schema.graphql`,
    );
    await Rover.instance.writeSupergraphSDL(item.wbFilePath, exportPath);
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
    const workbenchFile = JSON.parse(fileContent) as ApolloConfig;

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
