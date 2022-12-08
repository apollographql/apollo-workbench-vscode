import { existsSync, readdirSync } from 'fs';
import path, { join, parse, resolve, normalize } from 'path';
import {
  commands,
  Disposable,
  EventEmitter,
  FileChangeEvent,
  FileStat,
  FileSystemProvider,
  FileType,
  ProgressLocation,
  Uri,
  window,
  workspace,
} from 'vscode';
import { StateManager } from '../stateManager';
import { WorkbenchDiagnostics } from '../diagnosticsManager';
import { log } from '../../utils/logger';
import { load, dump } from 'js-yaml';
import { TextDecoder, TextEncoder } from 'util';
import { ApolloConfig } from './ApolloConfig';
import { execSync } from 'child_process';
import { Rover } from '../rover';
import { getFileName } from '../../utils/path';

export const schemaFileUri = (filePath: string, wbFilePath: string) => {
  if (parse(filePath).dir == '.') {
    const wbFileFolder = wbFilePath.split(getFileName(wbFilePath))[0];
    return Uri.parse(resolve(wbFileFolder, normalize(filePath)));
  }
  return Uri.parse(filePath);
};

export const tempSchemaFilePath = (wbFilePath: string, subgraphName: string) =>
  Uri.parse(
    resolve(
      StateManager.instance.extensionGlobalStoragePath,
      'schemas',
      `${getFileName(wbFilePath)}-${subgraphName}.graphql`,
    ),
  );

export class FileProvider implements FileSystemProvider {
  private static _instance: FileProvider;
  static get instance(): FileProvider {
    if (!this._instance) this._instance = new FileProvider();

    return this._instance;
  }

  loadedWorbenchFilePath = '';
  loadedWorkbenchFile?: ApolloConfig;
  private workbenchFiles: Map<string, ApolloConfig> = new Map();

  async writeTempSchemaFile(
    wbFilePath: string,
    subgraphName: string,
    sdl?: string,
  ) {
    if (sdl == undefined) {
      const subgraph =
        this.workbenchFileFromPath(wbFilePath)?.subgraphs[subgraphName];
      sdl = await Rover.instance.subgraphFetch(subgraph);
    }

    const tempLocation = tempSchemaFilePath(wbFilePath, subgraphName);
    await workspace.fs.writeFile(tempLocation, new TextEncoder().encode(sdl));

    return tempLocation;
  }

  async load(wbFilePath: string, shouldCompose = true): Promise<boolean> {
    this.loadedWorkbenchFile =
      this.workbenchFileFromPath(wbFilePath) ?? undefined;

    const workbenchFileToLoad = this.workbenchFileFromPath(wbFilePath);
    if (workbenchFileToLoad) {
      this.loadedWorbenchFilePath = wbFilePath;

      if (shouldCompose)
        await this.refreshWorkbenchFileComposition(this.loadedWorbenchFilePath);

      return true;
    }

    return false;
  }

  workbenchFileFromPath(path: string): ApolloConfig {
    let wbFile = this.workbenchFiles.get(path);
    if (!wbFile)
      //we're on Windows
      wbFile = this.workbenchFiles.get(path.replace(/\//g, '\\'));

    if (!wbFile) throw new Error(`Unable to get workbench file from ${path}`);

    return wbFile;
  }
  async readFile(uri: Uri): Promise<Uint8Array> {
    const name = uri.fragment;
    const wbFilePath = this.getPath(uri.path);
    const wbFile = this.workbenchFileFromPath(wbFilePath);
    if (wbFile) {
      this.load(wbFilePath);

      if (uri.query == 'subgraphs') {
        const subgraph = wbFile?.subgraphs[name];
        if (subgraph) {
          if (subgraph.schema.file) {
            return await workspace.fs.readFile(Uri.parse(subgraph.schema.file));
          } else if (subgraph.schema.graphref) {
            return execSync(
              `rover subgraph fetch ${subgraph.schema.graphref} --name=${
                subgraph.schema.subgraph || subgraph.name
              }`,
            );
          } else if (subgraph.schema.subgraph_url) {
            return execSync(
              `rover subgraph introspect ${subgraph.schema.subgraph_url}`,
            );
          } else {
            //error
          }
        }
        return Buffer.from('Could not find subgraph in raml');
      }
      //   else if (uri.path.includes('/queries')) {
      //     const op = wbFile?.operations[name];

      //     //Support Legacy format of operation as a string only
      //     if (typeof op == 'string') return Buffer.from(op);
      //     else if (op?.operation) return Buffer.from(op.operation);
      //     else return Buffer.from('');
      //   } else if (uri.path.includes('/queryplans')) {
      //     let queryPlan = '';

      //     if (this.loadedWorkbenchFile) {
      //       queryPlan = WorkbenchFederationProvider.generateQueryPlan(
      //         name,
      //         this.loadedWorkbenchFile,
      //       );

      //       if (queryPlan.length == 0)
      //         queryPlan =
      //           'Unable to generate Query Plan, do you have a supergraph schema available?';
      //     } else queryPlan = `Unable to load workbench file: ${wbFilePath}`;

      //     return Buffer.from(queryPlan);
      //   } else if (uri.path.includes('/subgraph-settings')) {
      //     const subgraph = wbFile?.schemas[name];
      //     if (subgraph) {
      //       const settings: WorkbenchSettings = {
      //         url: subgraph?.url ?? '',
      //       };

      //       return Buffer.from(JSON.stringify(settings, null, 2));
      //     } else
      //       return Buffer.from(JSON.stringify(new WorkbenchSettings(), null, 2));
      //   } else if (uri.path.includes('/supergraph-schema')) {
      //     return Buffer.from(wbFile?.supergraphSdl ?? '');
      //   } else if (uri.path.includes('/supergraph-api-schema')) {
      //     if (wbFile && wbFile.supergraphSdl) {
      //       const schema = WorkbenchFederationProvider.superSchemaToApiSchema(
      //         wbFile.supergraphSdl,
      //       );
      //       return Buffer.from(printSchema(schema));
      //     } else if (!wbFile)
      //       return Buffer.from(
      //         `Workbench file could not be loaded: ${wbFilePath}`,
      //       );
      //     else return Buffer.from(`There is no supergraphSDL currently defined`);
      //   }

      //   throw new Error('Unhandled workbench URI');
    }
    throw new Error(`Unable to load workbench file for ${wbFilePath}`);
  }
  write(uri: Uri, content: string): void | Thenable<void> {
    return this.writeFile(uri, Buffer.from(content), {
      create: true,
      overwrite: true,
    });
  }
  writeFile(
    uri: Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean } = {
      create: true,
      overwrite: true,
    },
  ): void | Thenable<void> {
    const name = uri.query;
    const stringContent = content.toString();
    const wbFilePath = uri.path;
    const wbFile = this.workbenchFileFromPath(wbFilePath);

    // if (wbFile) {
    //   let shouldSave = true;
    //   if (uri.path.includes('/subgraphs')) {
    //     //Since we are making a change to a subgraph, we should notify the ServerManager
    //     if (!wbFile.schemas[name]) {
    //       wbFile.schemas[name] = {
    //         sdl: stringContent ?? '',
    //         autoUpdateSchemaFromUrl: false,
    //       };
    //     } else {
    //       wbFile.schemas[name].sdl = stringContent;
    //       const compResults = WorkbenchFederationProvider.compose(wbFile);
    //       if (compResults.errors) {
    //         WorkbenchDiagnostics.instance.setCompositionErrors(
    //           wbFilePath,
    //           wbFile,
    //           compResults.errors,
    //         );
    //         wbFile.supergraphSdl = '';
    //       } else {
    //         wbFile.supergraphSdl = compResults.supergraphSdl;
    //         StateManager.instance.workspaceState_schema =
    //           compResults.schema.toGraphQLJSSchema();
    //         WorkbenchDiagnostics.instance.clearCompositionDiagnostics(
    //           wbFilePath,
    //         );

    //         if (this.loadedWorbenchFilePath == uri.path)
    //           this.loadedWorkbenchFile = wbFile;
    //       }
    //     }
    //   } else if (uri.path.includes('/queries')) {
    //     wbFile.operations[name] = { operation: stringContent };

    //     if (wbFile.supergraphSdl) {
    //       wbFile.queryPlans[name] =
    //         WorkbenchFederationProvider.generateQueryPlan(name, wbFile);
    //     }
    //   } else if (uri.path.includes('/subgraph-settings')) {
    //     const savedSettings: WorkbenchSettings = JSON.parse(stringContent);
    //     wbFile.schemas[name].url = savedSettings.url;
    //   } else if (uri.path.includes('/supergraph-schema')) {
    //     wbFile.supergraphSdl = stringContent;
    //   } else if (uri.path.includes('/supergraph-api-schema')) {
    //     shouldSave = false; //This is read-only if a user edits it in editor
    //   } else if (uri.path.includes('/queryplans')) {
    //     shouldSave = false; //This is read-only if a user edits it in editor
    //   } else if (uri.path.includes('/federation-composition')) {
    //     wbFile.federation = name ?? '1';
    //   }

    //   if (shouldSave) {
    //     this.writeWorbenchFile(wbFilePath, wbFile);
    //   }
    // } else throw new Error('Workbench file was unable to load');
  }
  delete(uri: Uri, options: { recursive: boolean }): void | Thenable<void> {
    // if (uri.scheme == 'workbench') {
    //   const wbFilePath = this.getPath(uri.path);
    //   const wbFile = this.workbenchFileFromPath(wbFilePath);
    //   if (wbFile) {
    //     const name = uri.query;
    //     if (uri.path.includes('/subgraphs')) {
    //       delete wbFile.schemas[name];
    //     } else if (uri.path.includes('/queries')) {
    //       delete wbFile.operations[name];
    //     } else if (uri.path.includes('/subgraph-settings')) {
    //       wbFile.schemas[name].autoUpdateSchemaFromUrl = false;
    //       wbFile.schemas[name].url = '';
    //     } else if (uri.path.includes('/supergraph-schema')) {
    //       wbFile.supergraphSdl = '';
    //     }
    //     // else if (uri.path.includes('/supergraph-api-schema')) {
    //     // }
    //     else if (uri.path.includes('/queryplans')) {
    //       delete wbFile.queryPlans[name];
    //     } else {
    //       throw new Error('Unknown uri format');
    //     }
    //     this.writeWorbenchFile(wbFilePath, wbFile);
    //   }
    // }
  }
  async convertSubgraphToDesign(
    wbFilePath: string,
    subgraphName: string,
    designPath: string,
  ) {
    const wbFile = this.workbenchFileFromPath(wbFilePath);
    wbFile.subgraphs[subgraphName].schema.workbench_design = designPath;

    const compResults = wbFile.composition_result;
    delete wbFile.composition_result;

    await workspace.fs.writeFile(
      Uri.parse(wbFilePath),
      new TextEncoder().encode(dump(wbFile)),
    );

    wbFile.composition_result = compResults;

    this.workbenchFiles.set(wbFilePath, wbFile);
  }

  async refreshWorkbenchFileComposition(wbFilePath: string) {
    return await window.withProgress(
      { location: ProgressLocation.Notification },
      async (progress) => {
        const wbFile = this.workbenchFileFromPath(wbFilePath);
        const designName = getFileName(wbFilePath);

        progress.report({
          message: `Composing ${designName}...`,
        });

        try {
          if (wbFile) {
            const compResults = await Rover.instance.compose(wbFilePath);
            if (compResults.data.success) {
              WorkbenchDiagnostics.instance.clearCompositionDiagnostics(wbFilePath);
              wbFile.composition_result = true;
              return compResults.data.core_schema;
            } else if (compResults.error) {
              wbFile.composition_result = false;
              await WorkbenchDiagnostics.instance.setCompositionErrors(
                wbFilePath,
                wbFile,
                compResults.error.details.build_errors,
              );
            }
          }
        } catch (err: any) {
          log(err.message);
        }
      },
    );
  }

  //All workbench files in opened VS Code folder
  async refreshLocalWorkbenchFiles() {
    // Clear all workbench files and workbench diagnostics
    this.workbenchFiles.clear();
    WorkbenchDiagnostics.instance.clearAllDiagnostics();

    const workspaceRoot = StateManager.workspaceRoot;
    if (workspaceRoot) {
      const workbenchFileURIs = await this.getWorkbenchFilesInDirectory(
        workspaceRoot,
      );

      if (workbenchFileURIs.length > 0) {
        for (let i = 0; i < workbenchFileURIs.length; i++) {
          const uri = workbenchFileURIs[i];
          const wbFilePath = uri.path;

          try {
            const yamlFile = await workspace.fs.readFile(uri);
            const wbString = yamlFile.toString();
            const wbFile = load(wbString) as ApolloConfig;

            this.workbenchFiles.set(wbFilePath, wbFile);
            WorkbenchDiagnostics.instance.createWorkbenchFileDiagnostics(
              getFileName(wbFilePath),
              wbFilePath,
            );

            await this.refreshWorkbenchFileComposition(wbFilePath);
          } catch (err) {
            window.showErrorMessage(
              `Workbench file was not in the correct format. File located at ${wbFilePath}`,
            );
          }
        }
        // workbenchFileURIs.forEach(async (workbenchURI) => {
        //   const wbFilePath = workbenchURI.path;

        //   try {
        //     const yamlFile =  await workspace.fs.readFile(workbenchURI);
        //     const wbString = yamlFile.toString();
        //     const wbFile = load(wbString) as ApolloConfig;

        //     this.workbenchFiles.set(wbFilePath, wbFile);
        //     WorkbenchDiagnostics.instance.createWorkbenchFileDiagnostics(
        //       getFileName(wbFilePath),
        //       wbFilePath,
        //     );

        //     await this.refreshLocalWorkbenchFile(wbFilePath);
        //   } catch (err) {
        //     window.showErrorMessage(
        //       `Workbench file was not in the correct format. File located at ${wbFilePath}`,
        //     );
        //   }
        // });
      }
    }
  }
  clearWorkbenchFiles() {
    this.workbenchFiles.clear();
  }
  getWorkbenchFiles() {
    return this.workbenchFiles;
  }
  async promptOpenFolder() {
    const openFolder = 'Open Folder';
    const response = await window.showErrorMessage(
      'You must open a folder to create Apollo Workbench files',
      openFolder,
    );
    if (response == openFolder)
      await commands.executeCommand('extension.openFolder');
  }

  //Workbench File Implementations
  async createWorkbenchFileLocally(designName: string, wbFile: ApolloConfig) {
    if (StateManager.workspaceRoot) {
      delete wbFile.composition_result;

      const wbFilePath = resolve(
        StateManager.workspaceRoot,
        `${designName}.yaml`,
      );
      await workspace.fs.writeFile(
        Uri.parse(wbFilePath),
        new TextEncoder().encode(dump(wbFile)),
      );
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
    }
  }

  workbenchFileByGraphName(name: string) {
    let wbFilePath = '';
    let wbFile: ApolloConfig = new ApolloConfig();
    this.workbenchFiles.forEach((value, key) => {
      if (getFileName(key) == name) {
        wbFilePath = key;
        wbFile = value;
      }
    });

    return { wbFile, path: wbFilePath };
  }
  getPath(path: string) {
    if (path.includes('/subgraphs')) {
      return path.split('/subgraphs')[0];
    } else if (path.includes('/queries')) {
      return path.split('/queries')[0];
    } else if (path.includes('/queryplans')) {
      return path.split('/queryplans')[0];
    } else if (path.includes('/subgraph-settings')) {
      return path.split('/subgraph-settings')[0];
    } else if (path.includes('/supergraph-schema')) {
      return path.split('/supergraph-schema')[0];
    } else if (path.includes('/supergraph-api-schema')) {
      return path.split('/supergraph-api-schema')[0];
    } else if (path.includes('/federation-composition')) {
      return path.split('/federation-composition')[0];
    }
    throw new Error('Unknown path type');
  }

  rename(
    oldUri: Uri,
    newUri: Uri,
    options: { overwrite: boolean },
  ): void | Thenable<void> {
    // if (this.currrentWorkbench && oldUri.scheme == 'workbench' && newUri.scheme == 'workbench') {
    //     const oldName = oldUri.query;
    //     const newName = newUri.query;
    //     if (oldUri.path.includes('/schemas')) {
    //         this.currrentWorkbenchSchemas[newName] = this.currrentWorkbenchSchemas[oldName];
    //         delete this.currrentWorkbenchSchemas[oldName];
    //         // getComposedSchemaLogCompositionErrors().next();
    //     } else if (oldUri.path.includes('/queries')) {
    //         this.currrentWorkbenchOperations[newName] = this.currrentWorkbenchOperations[oldName];
    //         delete this.currrentWorkbenchOperations[oldName];
    //     } else {
    //         throw new Error('Unknown uri format')
    //     }
    //     // this.saveCurrentWorkbench();
    // }
  }
  watch(
    uri: Uri,
    options: { recursive: boolean; excludes: string[] },
  ): Disposable {
    return new Disposable(() => undefined);
  }
  stat(uri: Uri): FileStat | Thenable<FileStat> {
    const now = Date.now();
    return {
      ctime: now,
      mtime: now,
      size: 0,
      type: FileType.File,
    };
  }
  readDirectory(
    uri: Uri,
  ): [string, FileType][] | Thenable<[string, FileType][]> {
    throw new Error('Method not implemented.');
  }
  createDirectory(uri: Uri): void | Thenable<void> {
    throw new Error('Method not implemented.');
  }
  onDidChangeEmitter = new EventEmitter<FileChangeEvent[]>();
  onDidChangeFile = this.onDidChangeEmitter.event;

  private async getWorkbenchFilesInDirectory(dirPath: string) {
    if (!dirPath || dirPath == '.') return [];

    const workbenchFiles = new Array<Uri>();
    const directories = new Array<string>();
    directories.push(dirPath);

    while (directories.length > 0) {
      const directory = directories[0];
      const dirents = readdirSync(directory, { withFileTypes: true });
      for (const dirent of dirents) {
        const directoryPath = path.resolve(directory, dirent.name);
        if (dirent.isDirectory() && dirent.name != 'node_modules') {
          directories.push(directoryPath);
        } else if (dirent.name.includes('.yaml')) {
          const yamlFile = await workspace.fs.readFile(
            Uri.parse(directoryPath),
          );
          const yaml = load(new TextDecoder().decode(yamlFile)) as ApolloConfig;
          if (yaml?.federation_version) {
            workbenchFiles.push(Uri.parse(directoryPath));
          }
        }
      }

      directories.splice(0, 1);
    }

    return workbenchFiles;
  }

  getPreloadedWorkbenchFiles() {
    const items: { fileName: string; path: string }[] = [];
    const preloadFileDir = join(
      __dirname,
      '..',
      '..',
      '..',
      'media',
      `preloaded-files`,
    );
    if (existsSync(preloadFileDir)) {
      const preloadedDirectory = readdirSync(preloadFileDir, {
        encoding: 'utf-8',
      });
      preloadedDirectory.map((item) => {
        items.push({
          fileName: item.split('.')[0],
          path: `${preloadFileDir}/${item}`,
        });
      });
    }
    return items;
  }
}
