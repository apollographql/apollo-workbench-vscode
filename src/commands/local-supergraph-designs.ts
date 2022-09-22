import { FileProvider } from '../workbench/file-system/fileProvider';
import {
  window,
  env,
  Uri,
  workspace,
  commands,
  TextDocument,
  Position,
  SnippetString,
  Range,
} from 'vscode';
import { StateManager } from '../workbench/stateManager';
import {
  SubgraphTreeItem,
  OperationTreeItem,
  SubgraphSummaryTreeItem,
  SupergraphSchemaTreeItem,
  SupergraphApiSchemaTreeItem,
  FederationVersionItem,
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
import {
  GetGraphSchemas_service_implementingServices_NonFederatedImplementingService,
  GetGraphSchemas_service_implementingServices_FederatedImplementingServices,
} from '../graphql/types/GetGraphSchemas';
import { join, resolve } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { printSchema, visit, print } from 'graphql';
import { log } from '../utils/logger';
import { WorkbenchFederationProvider } from '../workbench/federationProvider';
import gql from 'graphql-tag';

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
      Buffer.from(
        'extend schema \n\t@link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])\n\n',
      ),
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

export async function switchFederationComposition(item: FederationVersionItem) {
  let versionToChangeTo = item.wbFile.federation === '2' ? '1' : '2';
  const message = `${item.wbFile.graphName} is now using Apollo Federation composition ${versionToChangeTo}`;
  const uri = WorkbenchUri.supergraph(
    item.wbFilePath,
    versionToChangeTo,
    WorkbenchUriType.FEDERATION_COMPOSITION,
  );

  await FileProvider.instance.write(uri, '');
  log(message);
  window.showInformationMessage(message);
}

export async function addFederationDirective(
  directive: string,
  subgraphName: string,
  document: TextDocument,
) {
  let addedDirective = false;
  const loadedWorkbenchFilePath = WorkbenchUri.supergraph(
    FileProvider.instance.loadedWorbenchFilePath,
    subgraphName,
    WorkbenchUriType.SCHEMAS,
  );
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

  await document.save();
}
