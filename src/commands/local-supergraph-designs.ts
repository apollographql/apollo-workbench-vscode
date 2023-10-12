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
  env,
  Location,
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
import {
  getAccountGraphs,
  getGraphSchemasByVariant,
} from '../graphql/graphClient';
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
import {
  ApolloRemoteSchemaProvider,
  DesignOperationsDocumentProvider,
} from '../workbench/docProviders';
import { openFolder } from './extension';
import { whichDesign, whichOperation, whichSubgraph } from '../utils/uiHelpers';

let startingMocks = false;

export async function viewOperationDesignSideBySide(item?: OperationTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const operationName = item
    ? item.operationName
    : await whichSubgraph(wbFilePath);
  if (!operationName) return;

  const uri = DesignOperationsDocumentProvider.Uri(wbFilePath, operationName);
  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  if (wbFile.operations[operationName].ui_design) {
    viewOperationDesign(item);

    try {
      const editor = await window.showTextDocument(uri, {
        viewColumn: ViewColumn.Two,
      });
      console.log(editor);
    } catch (err) {
      console.log(err);
    }
  } else {
    const editor = await window.showTextDocument(uri);
    console.log(editor);
  }
}

export async function checkSubgraphSchema(item?: SubgraphTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const subgraphName = item
    ? item.subgraphName
    : await whichSubgraph(wbFilePath);
  if (!subgraphName) return;

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  const schema = wbFile.subgraphs[subgraphName];

  if (schema.schema.graphref && !schema.schema.workbench_design) {
    const cantCheckGraphRef = `This schema is just a reference to what is already in GraphOS`;
    log(cantCheckGraphRef);
    window.showWarningMessage(cantCheckGraphRef);
    return;
  }

  const accountId = StateManager.instance.globalState_selectedApolloAccount;
  if (accountId) {
    log(
      `Performing schema validation with ${accountId} against subgraph ${subgraphName} in local design ${getFileName(
        wbFilePath,
      )}`,
    );

    await window.withProgress(
      { location: ProgressLocation.Notification, cancellable: false },
      async (progress) => {
        progress.report({
          message: `Getting supergraphs from GraphOS...`,
        });
        const services = await getAccountGraphs(accountId);
        if (services?.organization?.graphs) {
          const logMessage = `${services.organization.graphs.length} Supergraphs found in GraphOS`;
          log(logMessage);
          progress.report({
            message: logMessage,
            increment: 50,
          });
          const selectedGraph = await window.showQuickPick(
            services?.organization?.graphs.map((g) => g.title),
            {
              title:
                'Select which graph you would like to check the schema against',
            },
          );
          if (selectedGraph) {
            log(`Selected Supergraph ${selectedGraph}`);
            const selected = services.organization.graphs.find(
              (g) => g.title == selectedGraph,
            );
            if (selected) {
              log(`${selected.variants.length} variants found in GraphOS`);
              const selectedVariant =
                selected.variants.length == 1
                  ? selected.variants[0].name
                  : await window.showQuickPick(
                      selected.variants.map((v) => v.name),
                      {
                        title:
                          'Select which variant you would like to check the schema against',
                      },
                    );

              log(`Selected variant ${selectedVariant}`);
              const graphRef = `${selected.id}@${selectedVariant}`;
              log(`Running schema validation on ${graphRef}`);
              progress.report({
                message: `Running schema validation on ${graphRef}`,
                increment: 25,
              });
              const results = await Rover.instance.checkSchema({
                graphRef,
                subgraphName,
                schemaPath:
                  schema.schema.file ?? schema.schema.workbench_design ?? '',
              });

              if (results.reportUrl) {
                log(`GraphOS Report - ${results.reportUrl}`);
                log(`Attempting to open GraphOS schema validation report`);
                await env.openExternal(Uri.parse(results.reportUrl));
              } else {
                //Other errors
                log(`Rover Error Code: ${results.error?.code}`);
                log(`\tMessage: ${results.error?.message}`);
                log('\tBuild Errors: ');
                results.error?.details.build_errors.forEach((be) =>
                  log(`\t\t- ${be.message}`),
                );
              }
            }
          } else {
            progress.report({
              message: 'Cancelled',
              increment: 50,
            });
          }
        }
      },
    );
  }
}

export async function mockSubgraph(item?: SubgraphTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const subgraphName = item
    ? item.subgraphName
    : await whichSubgraph(wbFilePath);
  if (!subgraphName) return;
  await FileProvider.instance.convertSubgraphToDesign(wbFilePath, subgraphName);
}

export async function stopRoverDevSession(item: SubgraphSummaryTreeItem) {
  await Rover.instance.stopRoverDev();
  window.showInformationMessage('Rover dev stopped');
}

export async function startRoverDevSession(item?: SubgraphSummaryTreeItem) {
  if (startingMocks) return;
  startingMocks = true;

  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) {
    startingMocks = false;
    return;
  }

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  if (Number.parseFloat(wbFile.federation_version ?? '2') < 2) {
    window.showErrorMessage(
      'rover dev is only supported for Apollo Federation 2',
    );
    return;
  }
  //Check for composition errors
  let errors = 0;
  WorkbenchDiagnostics.instance.diagnosticCollections
    .get(wbFilePath)
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
          const subgraphNames = Object.keys(wbFile.subgraphs);
          const subgraphsToMock: { [name: string]: Subgraph } = {};
          subgraphNames.forEach((s) => {
            if (wbFile.subgraphs[s].schema.workbench_design)
              subgraphsToMock[s] = wbFile.subgraphs[s];
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
            const subgraph = wbFile.subgraphs[subgraphName];
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
                      wbFilePath,
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

            await prom;

            if (i == 0)
              await new Promise<void>((resolve) => setTimeout(resolve, 5000));
            else
              await new Promise<void>((resolve) => setTimeout(resolve, 1000));
          }

          startingMocks = false;
          Rover.instance.primaryDevTerminal?.show();
          await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          progress.report({
            message: 'Opening Sandbox',
          });
          await commands.executeCommand('local-supergraph-designs.sandbox', {
            wbFilePath,
          });
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

export async function editSubgraph(item?: SubgraphTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const subgraphName = item
    ? item.subgraphName
    : await whichSubgraph(wbFilePath);
  if (!subgraphName) return;

  try {
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

export async function viewSupergraphSchema(item?: SupergraphTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const supergraphSDL =
    await FileProvider.instance.refreshWorkbenchFileComposition(wbFilePath);
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
export async function addSubgraph(item?: SubgraphSummaryTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

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
          'extend schema \n\t@link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])\n\ntype Query { \n\tdesignRoot: String\n}',
        ),
      );
      const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
      let port = 4001;
      for (const subgraphName in wbFile.subgraphs) {
        const subgraph = wbFile.subgraphs[subgraphName];
        if (
          subgraph.routing_url &&
          subgraph.routing_url.includes('http://localhost:')
        ) {
          const portString = subgraph.routing_url.split(':')[2];
          const subgraphPort = Number.parseInt(portString);
          if (port < subgraphPort) port = subgraphPort;
          else if (port == subgraphPort) port++;
        }
      }

      wbFile.subgraphs[subgraphName] = {
        routing_url: `http://localhost:${port}`,
        schema: {
          file: newSchemaFilePath,
        },
      };
      await FileProvider.instance.writeWorkbenchConfig(wbFilePath, wbFile);
    }
  }
}
export async function deleteSubgraph(item?: SubgraphTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;
  const subgraphName = item
    ? item.subgraphName
    : await whichSubgraph(wbFilePath);
  if (!subgraphName) return;

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  delete wbFile.subgraphs[subgraphName];
  await FileProvider.instance.writeWorkbenchConfig(wbFilePath, wbFile);
}

export async function deleteOperation(item?: OperationTreeItem) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const operationName = item
    ? item.operationName
    : await whichOperation(wbFilePath);
  if (!operationName) return;

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);

  delete wbFile.operations[operationName];
  await FileProvider.instance.writeWorkbenchConfig(wbFilePath, wbFile);
}

export async function addOperation(
  item?: OperationTreeItem | AddDesignOperationTreeItem,
) {
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);

  const operationName = await window.showInputBox({
    title: 'Define Operation Name',
  });
  if (operationName) {
    wbFile.operations[operationName] = {
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
      if (uiDesign) wbFile.operations[operationName].ui_design = uiDesign;
    }

    await FileProvider.instance.writeWorkbenchConfig(wbFilePath, wbFile);
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

export async function newDesignFromGraphOSSupergraph(
  graphVariantTreeItem: StudioGraphTreeItem | StudioGraphVariantTreeItem,
  selectedVariant?: string,
) {
  if (!StateManager.workspaceRoot) {
    await promptOpenFolder();
  } else {
    const graphId = graphVariantTreeItem.graphId;
    selectedVariant =
      (graphVariantTreeItem as StudioGraphVariantTreeItem)?.graphVariant ??
      undefined;

    if (
      !selectedVariant &&
      (graphVariantTreeItem as StudioGraphTreeItem)?.variants
    ) {
      const graphVariants = (graphVariantTreeItem as StudioGraphTreeItem)
        ?.variants;
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
  const wbFilePath = item ? item.wbFilePath : await whichDesign();
  if (!wbFilePath) return;

  if (StateManager.workspaceRoot) {
    const exportPath = resolve(
      StateManager.workspaceRoot,
      `${getFileName(item.wbFilePath)}-supergraph-schema.graphql`,
    );
    await Rover.instance.writeSupergraphSDL(wbFilePath, exportPath);
  }
}

export async function promptOpenFolder() {
  const action = 'Open Folder';
  const response = await window.showErrorMessage(
    'You must open a folder to create Apollo Workbench files',
    action,
  );
  if (response == action) await openFolder();
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
        `extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["${directive}"])\n\n`,
      ),
      new Position(0, 0),
    );
  }

  await document.save();
}
