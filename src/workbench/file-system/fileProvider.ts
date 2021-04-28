import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path, { join, resolve } from 'path';
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
  workspace,
} from 'vscode';
import { StateManager } from '../stateManager';
import { getComposedSchemaLogCompositionErrorsForWbFile } from '../../graphql/composition';
import { ApolloWorkbenchFile, WorkbenchSettings } from './fileTypes';
import { parse, GraphQLSchema, extendSchema, printSchema } from 'graphql';
import {
  buildOperationContext,
  buildComposedSchema,
  QueryPlanner,
} from '@apollo/query-planner';
import { serializeQueryPlan } from '@apollo/query-planner';

export class FileProvider implements FileSystemProvider {
  //Singleton implementation
  private static _instance: FileProvider;
  static get instance(): FileProvider {
    if (!this._instance)
      this._instance = new FileProvider(StateManager.workspaceRoot);

    return this._instance;
  }

  constructor(private workspaceRoot?: string) {}

  //All workbench files in opened VS Code folder
  private workbenchFiles: Map<string, ApolloWorkbenchFile> = new Map();
  refreshLocalWorkbenchFiles() {
    this.workbenchFiles.clear();
    const workspaceRoot = StateManager.workspaceRoot;
    if (workspaceRoot) {
      const workbenchFiles = this.getWorkbenchFilesInDirectory(workspaceRoot);
      workbenchFiles.forEach((workbenchFile) => {
        try {
          const test = JSON.parse(
            readFileSync(workbenchFile.path, { encoding: 'utf-8' }),
          );
          const wbFile = JSON.parse(
            readFileSync(workbenchFile.path, { encoding: 'utf-8' }),
          ) as ApolloWorkbenchFile;
          this.workbenchFiles.set(workbenchFile.path, wbFile);
        } catch (err) {
          window.showErrorMessage(
            `Workbench file was not in the correct format. File located at ${workbenchFile.fsPath}`,
          );
        }
      });
    }

    return this.workbenchFiles;
  }
  clearWorkbenchFiles() {
    this.workbenchFiles.clear();
  }
  getWorkbenchFiles() {
    return this.workbenchFiles;
  }

  loadedWorbenchFilePath = '';
  loadedWorkbenchFile?: ApolloWorkbenchFile;
  loadWorkbenchForComposition(wbFilePath: string, forceCompose = false) {
    if (this.loadedWorbenchFilePath != wbFilePath) {
      this.loadedWorbenchFilePath = wbFilePath;
      this.loadedWorkbenchFile = this.workbenchFileFromPath(wbFilePath);
      this.refreshComposition(wbFilePath);
    } else if (forceCompose) {
      this.refreshComposition(wbFilePath);
    }
  }
  refreshComposition(wbFilePath: string) {
    window.setStatusBarMessage(
      'Composition Running',
      getComposedSchemaLogCompositionErrorsForWbFile(wbFilePath),
    );
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
      writeFileSync(path, JSON.stringify(wbFile), { encoding: 'utf8' });
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
    }
  }
  async copyPreloadedWorkbenchFile(fileName: string) {
    if (!StateManager.workspaceRoot) {
      await this.promptOpenFolder();
    } else {
      const preloadFileDir = join(
        __dirname,
        '..',
        '..',
        '..',
        'media',
        `preloaded-files`,
        `${fileName}.apollo-workbench`,
      );
      const workbenchFile = JSON.parse(
        readFileSync(preloadFileDir, { encoding: 'utf-8' }),
      ) as ApolloWorkbenchFile;

      this.createWorkbenchFileLocally(workbenchFile);
    }
  }
  saveWorkbenchFile(
    wbFile: ApolloWorkbenchFile,
    wbFilePath: string,
    refreshTree = true,
  ) {
    writeFileSync(wbFilePath, JSON.stringify(wbFile), { encoding: 'utf8' });
    if (refreshTree)
      StateManager.instance.localSupergraphTreeDataProvider.refresh();
  }
  workbenchFileFromPath(path: string) {
    let wbFile = this.workbenchFiles.get(path);
    if (!wbFile)
      //we're on Windows
      wbFile = this.workbenchFiles.get(path.replace(/\//g, '\\'));

    return wbFile;
  }
  workbenchFileByGraphName(name: string) {
    let path = '';
    let wbFile: ApolloWorkbenchFile = new ApolloWorkbenchFile(name);
    this.workbenchFiles.forEach((value, key) => {
      if (value.graphName == name) {
        path = key;
        wbFile = value;
      }
    });
    // let wbFile = this.workbenchFiles.get(path);
    // if (!wbFile) //we're on Windows
    //     wbFile = this.workbenchFiles.get(path.replace(/\//g, '\\'));

    return { wbFile, path };
  }
  //FileSystemProvider Implementations
  //File chagnes are watched at the `vscode.workspace.onDidChangeTextDocument` level
  readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
    const name = uri.query;
    if (uri.path.includes('/subgraphs')) {
      const wbFilePath = uri.path.split('/subgraphs')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);

      return Buffer.from(wbFile?.schemas[name].sdl ?? '');
    } else if (uri.path.includes('/queries')) {
      const wbFilePath = uri.path.split('/queries')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      return Buffer.from(wbFile?.operations[name] ?? '');
    } else if (uri.path.includes('/queryplans')) {
      const wbFilePath = uri.path.split('/queryplans')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      //If we don't have a queryplan and we have a supergraphSdl, try generating query plan
      if (wbFile?.supergraphSdl) {
        if (!wbFile?.queryPlans[name]) {
          wbFile.queryPlans[name] = this.generateQueryPlan(name, wbFile);
          this.saveWorkbenchFile(wbFile, wbFilePath, false);
        }
      } else
        window.showInformationMessage(
          `No valid Superschema SDL available, unable to generate a query plan.`,
        );

      return Buffer.from(
        wbFile?.queryPlans[name]
          ? wbFile?.queryPlans[name]
          : 'Unable to generate Query Plan, do you have a supergraph schema available?',
      );
    } else if (uri.path.includes('/subgraph-settings')) {
      const wbFilePath = uri.path.split('/subgraph-settings')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      const subgraph = wbFile?.schemas[name];
      if (subgraph) {
        const settings: WorkbenchSettings = {
          url: subgraph?.url ?? '',
          requiredHeaders: subgraph?.requiredHeaders ?? [],
          mocks: {
            shouldMock: subgraph?.shouldMock ?? true,
            autoUpdateSchemaFromUrl: subgraph?.autoUpdateSchemaFromUrl ?? false,
          },
        };

        return Buffer.from(JSON.stringify(settings, null, 2));
      } else
        return Buffer.from(JSON.stringify(new WorkbenchSettings(), null, 2));
    } else if (uri.path.includes('/supergraph-schema')) {
      const wbFilePath = uri.path.split('/supergraph-schema')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      return Buffer.from(wbFile?.supergraphSdl ?? '');
    } else if (uri.path.includes('/supergraph-api-schema')) {
      const wbFilePath = uri.path.split('/supergraph-api-schema')[0];
      const wbFile = this.workbenchFileFromPath(wbFilePath);
      const schema = new GraphQLSchema({
        query: undefined,
      });
      const parsed = parse(wbFile?.supergraphSdl ?? '');
      const finalSchema = extendSchema(schema, parsed, {
        assumeValidSDL: true,
      });

      return Buffer.from(printSchema(finalSchema));
    }

    throw new Error('Unhandled workbench URI');
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
  generateQueryPlan(operationName: string, wbFile: ApolloWorkbenchFile) {
    try {
      const operation = wbFile.operations[operationName];
      const schema = buildComposedSchema(parse(wbFile.supergraphSdl));
      const operationContext = buildOperationContext(
        schema,
        parse(operation),
        operationName,
      );
      const queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operationContext, {
        autoFragmentization: false,
      });
      const queryPlanString = serializeQueryPlan(queryPlan);

      return queryPlanString;
    } catch (err) {
      console.log(err);
      return '';
    }
  }
  writeFile(
    uri: Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void | Thenable<void> {
    //Supergraph schema and queryplans are read-only
    if (
      uri.path.includes('supergraph-schema') ||
      uri.path.includes('supergraph-api-schema') ||
      uri.path.includes('queryplans')
    )
      return;

    const name = uri.query;
    const wbFilePath = this.getPath(uri.path);
    const wbFile = this.workbenchFileFromPath(wbFilePath);
    const stringContent = content.toString();

    if (wbFile) {
      let shouldRecompose = false;
      if (uri.path.includes('/subgraphs')) {
        if (wbFile.schemas[name].sdl != stringContent) {
          wbFile.schemas[name].sdl = stringContent;
          shouldRecompose = true;
        }
      } else if (uri.path.includes('/queries')) {
        wbFile.operations[name] = stringContent;

        if (wbFile.supergraphSdl) {
          try {
            const queryPlanString = this.generateQueryPlan(name, wbFile);

            wbFile.queryPlans[name] = queryPlanString;
          } catch (err) {
            console.log(err);
          }
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
        wbFile.supergraphSdl = stringContent;
      }

      this.saveWorkbenchFile(wbFile, wbFilePath);
      if (shouldRecompose) this.loadWorkbenchForComposition(wbFilePath, true);
    } else throw new Error('Workbench file was unable to load');
  }
  delete(uri: Uri, options: { recursive: boolean }): void | Thenable<void> {
    // if (uri.scheme == 'workbench') {
    //     if (uri.path.includes('/schemas')) {
    //         const serviceName = uri.query;
    //         delete this.currrentWorkbenchSchemas[serviceName];
    //     } else if (uri.path.includes('/queries')) {
    //         const operationName = uri.query;
    //         delete this.currrentWorkbenchOperations[operationName];
    //     } else {
    //         throw new Error('Unknown uri format')
    //     }
    //     window.showTextDocument(uri, { preview: true, preserveFocus: false })
    //         .then(() => commands.executeCommand('workbench.action.closeActiveEditor'));
    //     // this.saveCurrentWorkbench(false);
    // }
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
          const uri = Uri.parse(directoryPath);
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
