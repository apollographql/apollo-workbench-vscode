import { FileProvider } from '../workbench/file-system/fileProvider';
import { window, env, Uri, workspace, commands, Progress } from 'vscode';
import { StateManager } from '../workbench/stateManager';
import {
  SubgraphTreeItem,
  OperationTreeItem,
  SubgraphSummaryTreeItem,
  SupergraphSchemaTreeItem,
  SupergraphApiSchemaTreeItem,
  SupergraphTreeItem,
  FederationVersionItem,
} from '../workbench/tree-data-providers/superGraphTreeDataProvider';
import {
  WorkbenchUri,
  WorkbenchUriType,
} from '../workbench/file-system/WorkbenchUri';
import { ServerManager } from '../workbench/serverManager';
import {
  StudioGraphVariantTreeItem,
  StudioGraphTreeItem,
  PreloadedWorkbenchFile,
} from '../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { ApolloWorkbenchFile } from '../workbench/file-system/fileTypes';
import {
  createGraph,
  getGraphSchemasByVariant,
  getUserMemberships,
  publishSubgraph,
  setFederationCompositionTwo,
} from '../graphql/graphClient';
import {
  GetGraphSchemas_service_implementingServices_NonFederatedImplementingService,
  GetGraphSchemas_service_implementingServices_FederatedImplementingServices,
} from '../graphql/types/GetGraphSchemas';
import { join, resolve } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { GraphQLSchema, parse, extendSchema, printSchema } from 'graphql';
import { generateJsFederatedResolvers } from '../utils/exportFiles';
import { outputChannel } from '../extension';
import { log } from '../utils/logger';
import { WorkbenchFederationProvider } from '../workbench/federationProvider';
import { enterStudioApiKey } from './extension';
import { UserMemberships_me_User } from '../graphql/types/UserMemberships';
import { createJavascriptTemplate } from '../utils/createJavascriptTemplate';
import { execSync } from 'child_process';
import { createTypescriptTemplate } from '../utils/createTypescriptTemplate';

let startingMocks = false;

export async function startMocksWithDialog(item: SubgraphSummaryTreeItem) {
  if (startingMocks) return;
  startingMocks = true;

  await window.withProgress(
    { location: 15, title: `${item.wbFile.graphName}`, cancellable: false },
    async (progress, token) => {
      progress.report({ message: `Starting mocks` });
      return new Promise(async (resolve) => {
        await startMocks(item, progress);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        startingMocks = false;
        resolve(100);
      });
    },
  );
}

async function startMocks(
  item: SubgraphSummaryTreeItem,
  progress: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>,
) {
  outputChannel.show();
  if (item) {
    await ServerManager.instance.startSupergraphMocks(item.filePath, progress);
  } else {
    const wbFiles: string[] = [];
    FileProvider.instance
      .getWorkbenchFiles()
      .forEach((value, key) => wbFiles.push(value.graphName));
    const wbFileToStartMocks = await window.showQuickPick(wbFiles, {
      placeHolder: 'Select which supergraph design file to mock',
    });
    if (wbFileToStartMocks) {
      let wbFilePath = '';
      FileProvider.instance.getWorkbenchFiles().forEach((value, key) => {
        if (value.graphName == wbFileToStartMocks) wbFilePath = key;
      });

      if (existsSync(wbFilePath)) {
        await ServerManager.instance.startSupergraphMocks(wbFilePath, progress);
      } else
        window.showInformationMessage(
          'There was an error loading your workbench file for mocking, please file an issue on the repo with what happened and your workbench file',
        );
    } else
      window.showInformationMessage(
        'No supergraph was selected, cancelling mocks',
      );
  }
}
export async function stopMocks(item: SubgraphTreeItem) {
  ServerManager.instance.stopMocks();
}
export async function editSubgraph(item: SubgraphTreeItem) {
  const uri = WorkbenchUri.supergraph(
    item.wbFilePath,
    item.subgraphName,
    WorkbenchUriType.SCHEMAS,
  );
  try {
    FileProvider.instance.load(item.wbFilePath);
    await window.showTextDocument(uri);
  } catch (err: any) {
    log(err);
  }
}
export async function editSupergraphOperation(item: OperationTreeItem) {
  await window.showTextDocument(
    WorkbenchUri.supergraph(
      item.filePath,
      item.operationName,
      WorkbenchUriType.QUERIES,
    ),
  );
  FileProvider.instance.load(item.filePath);
}
export async function viewSubgraphSettings(item: SubgraphTreeItem) {
  await window.showTextDocument(
    WorkbenchUri.supergraph(
      item.wbFilePath,
      item.subgraphName,
      WorkbenchUriType.SCHEMAS_SETTINGS,
    ),
  );
}
export async function addOperation(item: OperationTreeItem) {
  const wbFilePath = item.filePath;
  const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  if (wbFile) {
    const operationName =
      (await window.showInputBox({
        placeHolder: 'Enter a name for the operation',
      })) ?? '';
    if (!operationName) {
      const message = `Create schema cancelled - No name entered.`;
      log(message);
      window.setStatusBarMessage(message, 3000);
    } else {
      const operation = `query ${operationName} {\n\t\n}`;
      const operationUri = WorkbenchUri.supergraph(
        item.filePath,
        operationName,
        WorkbenchUriType.QUERIES,
      );
      wbFile.operations[operationName] = { operation };
      await FileProvider.instance.writeFile(
        operationUri,
        Buffer.from(operation, 'utf8'),
        { create: true, overwrite: true },
      );

      const newOpDoc = await workspace.openTextDocument(operationUri);
      await window.showTextDocument(newOpDoc);
    }
  }
}
export async function setOperationDesignMock(item: OperationTreeItem) {
  env.openExternal(
    Uri.parse(
      'https://en.wikipedia.org/wiki/Visual_Studio_Code#/media/File:Visual_Studio_Code_Insiders_1.36_icon.svg',
    ),
  );
  // const panel = window.createWebviewPanel(
  //   "apolloWorkbenchDesign",
  //   'UI Design',
  //   ViewColumn.One,
  //   {
  //     // Enable javascript in the webview
  //     enableScripts: true,
  //     // And restrict the webview to only loading content from our extension's `media` directory.
  //     // localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
  //   },
  // );

  // panel.webview.html =
  // const wbFilePath = item.filePath;
  // const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
  // if (wbFile) {
  //   const remoteURL =
  //     (await window.showInputBox({
  //       placeHolder: 'Enter a name for the operation',
  //     })) ?? '';
  //   if (!remoteURL) {
  //     const message = `Create schema cancelled - No name entered.`;
  //     log(message);
  //     window.setStatusBarMessage(message, 3000);
  //   } else {
  //     wbFile.operations[remoteURL] = { operation: `query ${remoteURL} {\n\t\n}` };
  //     FileProvider.instance.saveWorkbenchFile(wbFile, item.filePath);
  //   }
  // }
}
export async function deleteOperation(item: OperationTreeItem) {
  const opUri = WorkbenchUri.supergraph(
    item.filePath,
    item.operationName,
    WorkbenchUriType.QUERIES,
  );
  await FileProvider.instance.delete(opUri, { recursive: true });
}
export async function viewQueryPlan(item: OperationTreeItem) {
  await window.showTextDocument(
    WorkbenchUri.supergraph(
      item.filePath,
      item.operationName,
      WorkbenchUriType.QUERY_PLANS,
    ),
  );
}
export async function viewSupergraphSchema(item: SupergraphSchemaTreeItem) {
  FileProvider.instance.load(item.filePath);
  await window.showTextDocument(
    WorkbenchUri.supergraph(
      item.filePath,
      item.wbFile.graphName,
      WorkbenchUriType.SUPERGRAPH_SCHEMA,
    ),
  );
}
export async function viewSupergraphApiSchema(
  item: SupergraphApiSchemaTreeItem,
) {
  FileProvider.instance.load(item.filePath);
  await window.showTextDocument(
    WorkbenchUri.supergraph(
      item.filePath,
      item.wbFile.graphName,
      WorkbenchUriType.SUPERGRAPH_API_SCHEMA,
    ),
  );
}
export function refreshSupergraphs() {
  StateManager.instance.localSupergraphTreeDataProvider.refresh();
}
export async function addSubgraph(item: SubgraphSummaryTreeItem) {
  const wbFile = item.wbFile;
  const serviceName =
    (await window.showInputBox({
      placeHolder: 'Enter a unique name for the subgraph',
    })) ?? '';
  if (!serviceName) {
    const message = `Create schema cancelled - No name entered.`;
    log(message);
    window.setStatusBarMessage(message, 3000);
  } else {
    FileProvider.instance.writeFile(
      WorkbenchUri.supergraph(
        item.filePath,
        serviceName,
        WorkbenchUriType.SCHEMAS,
      ),
      Buffer.from(''),
      { create: true, overwrite: true },
    );
  }
}
export async function deleteSubgraph(item: SubgraphTreeItem) {
  await FileProvider.instance.delete(
    WorkbenchUri.supergraph(
      item.wbFilePath,
      item.subgraphName,
      WorkbenchUriType.SCHEMAS,
    ),
    { recursive: true },
  );
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
      FileProvider.instance.createWorkbenchFileLocally(
        new ApolloWorkbenchFile(workbenchName),
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
    const workbenchFile: ApolloWorkbenchFile = new ApolloWorkbenchFile(
      graphName,
    );
    workbenchFile.graphName = graphName;

    const results = await getGraphSchemasByVariant(
      StateManager.instance.globalState_userApiKey,
      graphId,
      selectedVariant,
    );
    const monolithicService = results.service
      ?.implementingServices as GetGraphSchemas_service_implementingServices_NonFederatedImplementingService;
    if (monolithicService?.graphID) {
      workbenchFile.schemas['monolith'] = {
        sdl: results.service?.schema?.document,
        shouldMock: true,
        autoUpdateSchemaFromUrl: false,
      };
    } else {
      const implementingServices = results.service
        ?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;
      implementingServices?.services?.map(
        (service) =>
          (workbenchFile.schemas[service.name] = {
            sdl: service.activePartialSchema.sdl,
            url: service.url ?? '',
            shouldMock: true,
            autoUpdateSchemaFromUrl: false,
          }),
      );
    }

    const { supergraphSdl } =
      WorkbenchFederationProvider.compose(workbenchFile);
    if (supergraphSdl) workbenchFile.supergraphSdl = supergraphSdl;

    FileProvider.instance.createWorkbenchFileLocally(workbenchFile);
  } else {
    window.showInformationMessage(
      'You must provide a name to create a new workbench file',
    );
  }
}

export async function updateSubgraphSchemaFromURL(item: SubgraphTreeItem) {
  if (StateManager.settings_tlsRejectUnauthorized)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const subgraphName = item.subgraphName;
  const wbFile = FileProvider.instance.workbenchFileFromPath(item.wbFilePath);
  if (wbFile) {
    if (wbFile?.schemas[subgraphName] && !wbFile?.schemas[subgraphName].url) {
      const routingURL =
        (await window.showInputBox({
          placeHolder: 'Enter a the url for the schema/service',
        })) ?? '';
      if (!routingURL) {
        const message = `Set service URL cancelled for ${item.subgraphName} - No URL entered.`;
        log(message);
        window.setStatusBarMessage(message, 3000);
      } else {
        wbFile.schemas[item.subgraphName].url = routingURL;
      }
    }

    if (wbFile?.schemas[subgraphName].url) {
      const sdl = await WorkbenchFederationProvider.getRemoteTypeDefs(
        subgraphName,
        wbFile,
      );
      if (sdl) {
        const subgraphUri = WorkbenchUri.supergraph(
          item.wbFilePath,
          subgraphName,
          WorkbenchUriType.SCHEMAS,
        );
        FileProvider.instance.writeFile(subgraphUri, Buffer.from(sdl), {
          create: true,
          overwrite: true,
        });

        //TODO: Is it still necessary to replace the text or does this refresh the doc while open?
        const editor = await window.showTextDocument(subgraphUri);
        // if (editor) {
        //   const document = editor.document;
        //   await editor.edit((editor) => {
        //     editor.replace(new Range(0, 0, document.lineCount, 0), sdl);
        //   });
        //   await document.save();
        // }
      }
    } else {
      //No URL entered for schema
      window.showErrorMessage(
        'You must set a url for the service if you want to update the schema from it.',
      );
    }
  }
}

export async function viewSubgraphCustomMocks(item: SubgraphTreeItem) {
  const subgraphMocksUri = WorkbenchUri.supergraph(
    item.supergraphName,
    item.subgraphName,
    WorkbenchUriType.MOCKS,
  );
  if (!existsSync(subgraphMocksUri.fsPath)) {
    const wbFile = FileProvider.instance.workbenchFileFromPath(item.wbFilePath);
    const customMocks = wbFile?.schemas[item.subgraphName].customMocks;
    if (customMocks)
      writeFileSync(subgraphMocksUri.fsPath, customMocks, {
        encoding: 'utf-8',
      });
    else
      writeFileSync(
        subgraphMocksUri.fsPath,
        "const faker = require('faker')\n\nconst mocks = {\n\n}\nmodule.exports = mocks;",
        { encoding: 'utf-8' },
      );
  }
  try {
    await window.showTextDocument(subgraphMocksUri);
  } catch (err: any) {
    log(err);
  }
}

export async function exportSupergraphSchema(item: SupergraphSchemaTreeItem) {
  if (item.wbFile.supergraphSdl && StateManager.workspaceRoot) {
    const exportPath = resolve(
      StateManager.workspaceRoot,
      `${item.wbFile.graphName}-supergraph-schema.graphql`,
    );
    const exportUri = Uri.parse(exportPath);
    writeFileSync(exportPath, item.wbFile.supergraphSdl, { encoding: 'utf-8' });
    window.showInformationMessage(
      `Supergraph Schema was exported to ${exportPath}`,
    );
  }
}

export async function exportSupergraphApiSchema(
  item: SupergraphApiSchemaTreeItem,
) {
  const supergraphSchema = item.wbFile.supergraphSdl;
  if (supergraphSchema && StateManager.workspaceRoot) {
    const exportPath = resolve(
      StateManager.workspaceRoot,
      `${item.wbFile.graphName}-api-schema.graphql`,
    );
    const finalSchema =
      WorkbenchFederationProvider.superSchemaToApiSchema(supergraphSchema);
    writeFileSync(exportPath, printSchema(finalSchema), { encoding: 'utf-8' });
    window.showInformationMessage(
      `Graph Core Schema was exported to ${exportPath}`,
    );
  }
}

export async function exportSubgraphSchema(item: SubgraphTreeItem) {
  const exportPath = StateManager.workspaceRoot
    ? resolve(StateManager.workspaceRoot, `${item.subgraphName}.graphql`)
    : null;
  if (exportPath) {
    const schema =
      FileProvider.instance.workbenchFileFromPath(item.wbFilePath)?.schemas[
        item.subgraphName
      ]?.sdl ?? '';
    writeFileSync(exportPath, schema, { encoding: 'utf-8' });

    window.showInformationMessage(
      `${item.subgraphName} schema was exported to ${exportPath}`,
    );
  }
}

export async function exportSubgraphResolvers(item: SubgraphTreeItem) {
  const exportPath = StateManager.workspaceRoot
    ? resolve(StateManager.workspaceRoot, `${item.subgraphName}-resolvers`)
    : null;
  if (exportPath) {
    let resolvers = '';
    const schema =
      FileProvider.instance.workbenchFileFromPath(item.wbFilePath)?.schemas[
        item.subgraphName
      ].sdl ?? '';
    resolvers = generateJsFederatedResolvers(schema);
    //TODO: Future Feature could have a more robust typescript generation version
    // let exportLanguage = await window.showQuickPick(["Javascript", "Typescript"], { canPickMany: false, placeHolder: "Would you like to use Javascript or Typescript for the exported project?" });
    // if (exportLanguage == "Typescript") {
    //     resolvers = generateTsFederatedResolvers(schema);
    //     exportPath += ".ts";
    // } else {
    //     resolvers = generateJsFederatedResolvers(schema);
    //     exportPath += ".js";
    // }

    writeFileSync(`${exportPath}.js`, resolvers, { encoding: 'utf-8' });
    window.showInformationMessage(
      `${item.subgraphName} resolvers was exported to ${exportPath}`,
    );
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

    FileProvider.instance.createWorkbenchFileLocally(workbenchFile);
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

export async function createDesignInStudio(item: SupergraphTreeItem) {
  await window.withProgress({ location: 15 }, async (progress) => {
    const wbFile = item.wbFile;
    outputChannel.show();
    if (!StateManager.instance.globalState_userApiKey) {
      log('No user api key found, prompting user to enter API key');
      await enterStudioApiKey();
    }

    const userApiKey = StateManager.instance.globalState_userApiKey;

    if (!userApiKey) {
      const noApiKeyMessage = 'No API key entered to create graph';
      log(noApiKeyMessage);
      window.showErrorMessage(noApiKeyMessage);
    } else {
      let graphName: string | undefined = wbFile.graphName;
      log(`Prompting user for graph name\n\tdefault: ${graphName}`);

      graphName = await window.showInputBox({
        value: graphName,
        placeHolder: 'Graph Name for Apollo Studio',
        ignoreFocusOut: true,
      });
      if (graphName) {
        const graphNamePublishMessage = `Publishing ${graphName}`;
        log(graphNamePublishMessage);
        progress.report({ message: graphNamePublishMessage, increment: 10 });

        const graphResponse = await getUserMemberships(userApiKey);
        const memberships =
          (graphResponse.me as UserMemberships_me_User)?.memberships ?? [];
        let accountToCreateIn: string | undefined;
        if (memberships.length == 0) {
          accountToCreateIn = undefined;
        } else if (memberships.length == 1) {
          accountToCreateIn = memberships[0].account.id;
        } else {
          log(
            `${memberships.length} membershipps found for user, prompting which to use for graph creation`,
          );
          const accountNames = memberships.map(
            (membership) => membership.account.id,
          );
          accountToCreateIn = await window.showQuickPick(accountNames, {
            canPickMany: false,
            ignoreFocusOut: true,
            title: 'Which account would you like to create the graph in?',
          });
        }

        if (accountToCreateIn) {
          const graphApiKey = await createGraph(
            userApiKey,
            accountToCreateIn,
            graphName,
          );
          if (
            graphApiKey != undefined &&
            !graphApiKey?.errors &&
            graphApiKey.length > 0
          ) {
            log(`Graph Created Successfully!`);
            progress.report({
              message: `Graph Created Successfully!`,
              increment: 25,
            });

            if (wbFile.federation == '2') {
              await setFederationCompositionTwo(userApiKey, graphName);
            }

            let counter = 0;
            const increment = 75 / Object.keys(wbFile.schemas).length;

            for (var subgraphName in wbFile.schemas) {
              log(`Publishing ${subgraphName} to ${accountToCreateIn}...`);
              const subgraph = wbFile.schemas[subgraphName];
              const schema = subgraph.sdl;
              let subgraphUrl = `http://localhost:${
                StateManager.settings_startingServerPort + counter
              }`;
              if (subgraph.url && subgraph.url != '')
                subgraphUrl = subgraph.url;

              const publishResponse = await publishSubgraph(
                userApiKey,
                graphName,
                subgraphName,
                subgraphUrl,
                schema,
              );

              if (publishResponse !== true) {
                log(`There was a problem publishing subgraph ${subgraphName}`);
                publishResponse.map((e) => log(`\t${e.message}`));

                progress.report({
                  message: `Error publishing shcema for subgraph ${subgraphName}, see VS Code Output window with Apollo Workbench selected for more details.`,
                  increment,
                });
              } else {
                const successMessage = `Subgraph ${subgraphName} schema published successfully!`;
                log(successMessage);
                progress.report({
                  message: successMessage,
                  increment,
                });
              }

              counter++;
            }

            await exportDesign(graphName, wbFile, graphApiKey);

            const studioUrl = `https://studio.apollographql.com/graph/${graphName}?variant=workbench`;
            log(`View your newly created graph at ${studioUrl}`);
            env.openExternal(Uri.parse(studioUrl));
          } else {
            const errorMessage = graphApiKey.errors[0].message;
            if (errorMessage.toLowerCase().includes('already exists')) {
              const existsMessage = `A graph with that name already exists.`;
              log(existsMessage);
              window.showErrorMessage(existsMessage);
            } else {
              const errorMessage = `Unable to create graph: ${graphName}`;
              log(errorMessage);
              window.showErrorMessage(errorMessage);
            }
          }
        } else {
          `You must select an account for the graph to be created in Apollo Studio`;
        }
      } else {
        const noGraphNameErrorMessage = `You must provide a name for the graph you are creating in Apollo Studio`;
        log(noGraphNameErrorMessage);
        window.showErrorMessage(noGraphNameErrorMessage);
      }
    }
  });
}

export async function exportDesignToProject(item: SupergraphTreeItem) {
  await exportDesign(item.wbFile.graphName, item.wbFile);
}

async function exportDesign(
  graphName: string,
  wbFile: ApolloWorkbenchFile,
  apiKey?: string,
) {
  const buildLocalProject = await window.showQuickPick(
    ['JavaScript', 'Typescript', 'None'],
    {
      ignoreFocusOut: true,
      title:
        'Would you like to create a getting started project locally that is configured for the newly created graph in Apollo Studio?',
    },
  );

  let assetPath: string | undefined = undefined;
  let shouldPromptToOpen = true;
  switch (buildLocalProject) {
    case 'None':
      shouldPromptToOpen = false;
      break;
    case 'JavaScript':
      assetPath = createJavascriptTemplate(wbFile, graphName, apiKey);

      break;
    case 'Typescript':
      assetPath = createTypescriptTemplate(wbFile, graphName, apiKey);

      break;
  }

  if (shouldPromptToOpen) {
    const shouldOpenProject = await window.showQuickPick(['Yes', 'No'], {
      ignoreFocusOut: true,
      title:
        'Would you like to have the project setup and opened in another VS Code window?',
    });
    if (shouldOpenProject == 'Yes') {
      execSync(`code ${assetPath}`);
    }
  }
}

export async function switchFederationComposition(item: FederationVersionItem) {
  let versionToChangeTo = '2';
  if (item.wbFile.federation == '2') versionToChangeTo = '1';

  const message = `${item.wbFile.graphName} is now using Apollo Federation composition ${versionToChangeTo}`;
  const uri = WorkbenchUri.supergraph(
    item.wbFilePath,
    versionToChangeTo,
    WorkbenchUriType.FEDERATION_COMPOSITION,
  );

  if (versionToChangeTo == '2') {
    //We should prompt the user about the alpha
    const message = `Federation 2 is available as an opt-in preview.

Note that this feature is in the alpha release stage and only supported in newer versions of Apollo Gateway. If you are running a gateway prior to version v2.0-alpha.0, this could lead to runtime errors. Please confirm you are running an updated gateway version before using the schemas designed with Federation 2.

https://www.apollographql.com/docs/federation/v2
`;
    const acknowledge = await window.showWarningMessage(
      'Upgrade design configuration to Apollo Federation 2?',
      {
        modal: true,
        detail: message,
      },
      'Upgrade',
    );
    if (acknowledge != 'Upgrade') {
      log(`${item.wbFile.graphName} upgrade to Federation 2 was cancelled.`);
      return;
    }
  }
  await FileProvider.instance.write(uri, '');
  log(message);
  window.showInformationMessage(message);
}
