import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path, { join, normalize, relative, resolve } from 'path';
import {
  commands,
  Disposable,
  EventEmitter,
  FileChangeEvent,
  FileStat,
  FileSystemProvider,
  FileType,
  Uri,
  window,
} from 'vscode';
import { StateManager } from '../stateManager';
import {
  ApolloWorkbenchFile,
  WorkbenchSettings,
} from './fileTypes';
import { printSchema } from 'graphql';
import { WorkbenchDiagnostics } from '../diagnosticsManager';
import { WorkbenchFederationProvider } from '../federationProvider';
import { WorkbenchUri, WorkbenchUriType } from './WorkbenchUri';
import { ServerManager } from '../serverManager';

export class FileProvider implements FileSystemProvider {
  constructor(private workspaceRoot?: string) { }

  private static _instance: FileProvider;
  static get instance(): FileProvider {
    if (!this._instance)
      this._instance = new FileProvider(StateManager.workspaceRoot);

    return this._instance;
  }

  loadedWorbenchFilePath = '';
  loadedWorkbenchFile?: ApolloWorkbenchFile;
  private workbenchFiles: Map<string, ApolloWorkbenchFile> = new Map();

  load(wbFilePath: string): boolean {
    this.loadedWorkbenchFile =
      this.workbenchFileFromPath(wbFilePath) ?? undefined;

    if (this.loadedWorbenchFilePath != wbFilePath) {
      const workbenchFileToLoad = this.workbenchFileFromPath(wbFilePath);
      if (workbenchFileToLoad) {
        this.loadedWorbenchFilePath = wbFilePath;


        window.setStatusBarMessage(
          'Composition Running',
          new Promise(() => this.loadCurrent()),
        );

        return true;
      }
    }

    return false;
  }

  workbenchFileFromPath(path: string): ApolloWorkbenchFile | null {
    let wbFile = this.workbenchFiles.get(path);
    if (!wbFile)
      //we're on Windows
      wbFile = this.workbenchFiles.get(path.replace(/\//g, '\\'));

    return wbFile ?? null;
  }
  readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
    const name = uri.query;
    const wbFilePath = this.getPath(uri.path);
    const wbFile = this.workbenchFileFromPath(wbFilePath);
    if (wbFile) {
      this.load(wbFilePath);

      if (uri.path.includes('/subgraphs')) {
        return Buffer.from(wbFile?.schemas[name].sdl ?? '');
      } else if (uri.path.includes('/queries')) {
        const op = wbFile?.operations[name];

        //Support Legacy format of operation as a string only
        if (typeof op == 'string') return Buffer.from(op);
        else if (op?.operation) return Buffer.from(op.operation);
        else return Buffer.from('');
      } else if (uri.path.includes('/queryplans')) {
        let queryPlan = '';

        if (this.loadedWorkbenchFile) {
          queryPlan = WorkbenchFederationProvider.generateQueryPlan(
            name,
            this.loadedWorkbenchFile,
          );

          if (queryPlan.length == 0)
            queryPlan =
              'Unable to generate Query Plan, do you have a supergraph schema available?';
        } else queryPlan = `Unable to load workbench file: ${wbFilePath}`;

        return Buffer.from(queryPlan);
      } else if (uri.path.includes('/subgraph-settings')) {
        const subgraph = wbFile?.schemas[name];
        if (subgraph) {
          const settings: WorkbenchSettings = {
            url: subgraph?.url ?? '',
            requiredHeaders: subgraph?.requiredHeaders ?? [],
            mocks: {
              shouldMock: subgraph?.shouldMock ?? true,
              autoUpdateSchemaFromUrl:
                subgraph?.autoUpdateSchemaFromUrl ?? false,
            },
          };

          return Buffer.from(JSON.stringify(settings, null, 2));
        } else
          return Buffer.from(JSON.stringify(new WorkbenchSettings(), null, 2));
      } else if (uri.path.includes('/supergraph-schema')) {
        return Buffer.from(wbFile?.supergraphSdl ?? '');
      } else if (uri.path.includes('/supergraph-api-schema')) {
        if (wbFile && wbFile.supergraphSdl) {
          const schema = WorkbenchFederationProvider.superSchemaToApiSchema(
            wbFile.supergraphSdl,
          );
          return Buffer.from(printSchema(schema));
        } else if (!wbFile)
          return Buffer.from(
            `Workbench file could not be loaded: ${wbFilePath}`,
          );
        else return Buffer.from(`There is no supergraphSDL currently defined`);
      }

      throw new Error('Unhandled workbench URI');
    }
    throw new Error(`Unable to load workbench file for ${wbFilePath}`);
  }
  writeFile(
    uri: Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void | Thenable<void> {
    const name = uri.query;
    const stringContent = content.toString();
    const wbFilePath = this.getPath(uri.path);
    const wbFile = this.workbenchFileFromPath(wbFilePath);

    if (wbFile) {
      let shouldSave = true;
      if (uri.path.includes('/subgraphs')) {
        //Since we are making a change to a subgraph, we should notify the ServerManager
        if (!wbFile.schemas[name]) {
          wbFile.schemas[name] = {
            shouldMock: true,
            sdl: stringContent ?? '',
            autoUpdateSchemaFromUrl: false,
          };
        } else {
          wbFile.schemas[name].sdl = stringContent;
          const compResults = WorkbenchFederationProvider.compose(wbFile);
          if (compResults.errors) {
            WorkbenchDiagnostics.instance.setCompositionErrors(
              wbFilePath,
              wbFile,
              compResults.errors,
            );
            wbFile.supergraphSdl = '';
          } else {
            wbFile.supergraphSdl = compResults.supergraphSdl;
            StateManager.instance.workspaceState_schema = compResults.schema;
            WorkbenchDiagnostics.instance.clearCompositionDiagnostics(
              wbFilePath,
            );

            if (this.loadedWorbenchFilePath == uri.path)
              this.loadedWorkbenchFile = wbFile;
          }
        }

        if(wbFilePath == ServerManager.instance.mocksWorkbenchFilePath){
          ServerManager.instance.mocksWorkbenchFile = wbFile;
          ServerManager.instance.restartSubgraph(wbFilePath,name);
        }
      } else if (uri.path.includes('/queries')) {
        wbFile.operations[name] = { operation: stringContent };

        if (wbFile.supergraphSdl) {
          wbFile.queryPlans[name] =
            WorkbenchFederationProvider.generateQueryPlan(name, wbFile);
        }
      } else if (uri.path.includes('/subgraph-settings')) {
        const savedSettings: WorkbenchSettings = JSON.parse(stringContent);
        wbFile.schemas[name].url = savedSettings.url;
        wbFile.schemas[name].shouldMock = savedSettings.mocks.shouldMock;
        wbFile.schemas[name].autoUpdateSchemaFromUrl =
          savedSettings.mocks.autoUpdateSchemaFromUrl;
        wbFile.schemas[name].requiredHeaders = savedSettings.requiredHeaders;
      } else if (uri.path.includes('/mocks')) {
        wbFile.schemas[name].customMocks = stringContent;
      } else if (uri.path.includes('/supergraph-schema')) {
        wbFile.supergraphSdl = stringContent; //TODO: Need to figure out how to block users editing and saving
      } else if (uri.path.includes('/supergraph-api-schema')) {
        shouldSave = false; //This is read-only if a user edits it in editor
      } else if (uri.path.includes('/queryplans')) {
        shouldSave = false; //This is read-only if a user edits it in editor
      }

      if (shouldSave) {
        this.writeWorbenchFile(wbFilePath, wbFile);
      }
    } else throw new Error('Workbench file was unable to load');
  }
  delete(uri: Uri, options: { recursive: boolean }): void | Thenable<void> {
    if (uri.scheme == 'workbench') {
      const wbFilePath = this.getPath(uri.path);
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      if (wbFile) {
        const name = uri.query;
        if (uri.path.includes('/subgraphs')) {
          delete wbFile.schemas[name];
        } else if (uri.path.includes('/queries')) {
          delete wbFile.operations[name];
        } else if (uri.path.includes('/subgraph-settings')) {
          wbFile.schemas[name].autoUpdateSchemaFromUrl = false;
          wbFile.schemas[name].customMocks = '';
          wbFile.schemas[name].requiredHeaders = [];
          wbFile.schemas[name].shouldMock = true;
          wbFile.schemas[name].url = '';
        } else if (uri.path.includes('/mocks')) {
          wbFile.schemas[name].customMocks = '';
        } else if (uri.path.includes('/supergraph-schema')) {
          wbFile.supergraphSdl = '';
        } else if (uri.path.includes('/supergraph-api-schema')) {
        } else if (uri.path.includes('/queryplans')) {
          delete wbFile.queryPlans[name];
        } else {
          throw new Error('Unknown uri format');
        }

        this.writeWorbenchFile(wbFilePath, wbFile);
      }
    }
  }
  private writeWorbenchFile(wbFilePath: string, wbFile: any) {
    writeFileSync(normalize(wbFilePath), JSON.stringify(wbFile), {
      encoding: 'utf8',
    });
    this.workbenchFiles.set(wbFilePath, wbFile);
    StateManager.instance.localSupergraphTreeDataProvider.refresh();
  }
  private loadCurrent() {
    if (this.loadedWorkbenchFile) {
      const compResults = WorkbenchFederationProvider.compose(
        this.loadedWorkbenchFile,
      );

      if (compResults.errors) {
        WorkbenchDiagnostics.instance.setCompositionErrors(
          this.loadedWorbenchFilePath,
          this.loadedWorkbenchFile,
          compResults.errors,
        );
        WorkbenchDiagnostics.instance.clearOperationDiagnostics(
          this.loadedWorbenchFilePath,
        );
      } else if (
        compResults.supergraphSdl &&
        this.loadedWorkbenchFile.supergraphSdl != compResults.supergraphSdl
      ) {
        this.loadedWorkbenchFile.supergraphSdl = compResults.supergraphSdl;
      }

      StateManager.instance.workspaceState_schema = compResults.schema;
      StateManager.instance.workspaceState_selectedWorkbenchAvailableEntities =
        WorkbenchFederationProvider.extractDefinedEntitiesByService(
          this.loadedWorkbenchFile,
        );
    }
  }

  //All workbench files in opened VS Code folder
  refreshLocalWorkbenchFiles(shouldCompose: boolean = true) {
    // Clear all workbench files and workbench diagnostics
    this.workbenchFiles.clear();
    WorkbenchDiagnostics.instance.clearAllDiagnostics();

    const workspaceRoot = StateManager.workspaceRoot;
    if (workspaceRoot) {
      const workbenchFiles = this.getWorkbenchFilesInDirectory(workspaceRoot);

      if (workbenchFiles.length > 0) {
        workbenchFiles.forEach((workbenchFile) => {
          const wbFilePath = workbenchFile.path;

          try {
            const wbString = readFileSync(wbFilePath, { encoding: 'utf-8' });
            const wbFile = JSON.parse(wbString) as ApolloWorkbenchFile;

            this.workbenchFiles.set(wbFilePath, wbFile);
            WorkbenchDiagnostics.instance.createWorkbenchFileDiagnostics(
              wbFile.graphName,
              wbFilePath,
            );

            //If there is no valid composition, we should try composing graph to:
            //  1. Add any composition diagnostics to Problems Panel
            //  2. Save valid supergraphSDL
            if (!wbFile.supergraphSdl) {
              const compResults = WorkbenchFederationProvider.compose(wbFile);
              if (compResults.errors) {
                WorkbenchDiagnostics.instance.setCompositionErrors(
                  wbFilePath,
                  wbFile,
                  compResults.errors,
                );
              } else {
                this.writeFile(
                  WorkbenchUri.supergraph(
                    wbFilePath,
                    '',
                    WorkbenchUriType.SUPERGRAPH_SCHEMA,
                  ),
                  new TextEncoder().encode(compResults.supergraphSdl),
                  { create: true, overwrite: true },
                );
              }
            }

            //Need to validate operations
            WorkbenchDiagnostics.instance.validateAllOperations(wbFilePath);
          } catch (err) {
            window.showErrorMessage(
              `Workbench file was not in the correct format. File located at ${wbFilePath}`,
            );
          }
        });
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
  createWorkbenchFileLocally(wbFile: ApolloWorkbenchFile) {
    if (StateManager.workspaceRoot) {
      const path = resolve(
        StateManager.workspaceRoot,
        `${wbFile.graphName}.apollo-workbench`,
      );
      writeFileSync(normalize(path), JSON.stringify(wbFile), { encoding: 'utf8' });
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
    }
  }

  workbenchFileByGraphName(name: string) {
    let wbFilePath = '';
    let wbFile: ApolloWorkbenchFile = new ApolloWorkbenchFile(name);
    this.workbenchFiles.forEach((value, key) => {
      if (value.graphName == name) {
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
    } else if (path.includes('/mocks')) {
      return path.split('/mocks')[0];
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

  private getWorkbenchFilesInDirectory(dirPath: string) {
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
        } else if (dirent.name.includes('.apollo-workbench')) {
          const uri = WorkbenchUri.parse(directoryPath);
          workbenchFiles.push(uri);
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
