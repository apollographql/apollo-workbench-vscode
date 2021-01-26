import { serializeQueryPlan } from '@apollo/gateway';
import { getQueryPlan, getQueryPlanner } from '@apollo/query-planner-wasm';
import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import path, { join, resolve } from 'path';
import { commands, Disposable, EventEmitter, FileChangeEvent, FileStat, FileSystemProvider, FileType, Position, Uri, window, workspace, Range, ProgressLocation } from 'vscode';
import { compositionDiagnostics, outputChannel } from '../../extension';
import { getGraphSchemasByVariant } from '../../studio-gql/graphClient';
import { GetGraphSchemas_service_implementingServices_FederatedImplementingServices, GetGraphSchemas_service_implementingServices_NonFederatedImplementingService } from '../../studio-gql/types/GetGraphSchemas';
import { ServerManager } from '../../workbench/serverManager';
import { StateManager } from '../../workbench/stateManager';
import { getComposedSchema, getComposedSchemaLogCompositionErrors, handleErrors } from '../composition';
import { ApolloWorkbenchFile, WorkbenchSettings } from './fileTypes';
import { parse, print } from 'graphql';
import { OverrideApolloGateway } from '../../gateway';

export enum WorkbenchUriType {
    SCHEMAS,
    SCHEMAS_SETTINGS,
    QUERIES,
    QUERY_PLANS
}
export class WorkbenchUri {
    static csdl(): Uri {
        return Uri.parse(`workbench:/csdl.graphql?${FileProvider.instance.currrentWorkbench.graphName}`);
    }
    static parse(name: string, type: WorkbenchUriType = WorkbenchUriType.SCHEMAS): Uri {
        switch (type) {
            case WorkbenchUriType.SCHEMAS:
                return Uri.parse(`workbench:/schemas/${name}.graphql?${name}`);
            case WorkbenchUriType.SCHEMAS_SETTINGS:
                return Uri.parse(`workbench:/settings-schemas/${name}-settings.json?${name}`);
            case WorkbenchUriType.QUERIES:
                return Uri.parse(`workbench:/queries/${name}.graphql?${name}`);
            case WorkbenchUriType.QUERY_PLANS:
                return Uri.parse(`workbench:/queryplans/${name}.queryplan?${name}`);
        }
    }
}

export class FileProvider implements FileSystemProvider {
    //Singleton implementation
    private static _instance: FileProvider;
    static get instance(): FileProvider {
        if (!this._instance)
            this._instance = new FileProvider(StateManager.workspaceRoot);

        return this._instance;
    }

    constructor(workspaceRoot?: string) {
    }

    //All workbench files in opened VS Code folder
    workbenchFiles: Map<string, ApolloWorkbenchFile> = new Map();
    refreshLocalWorkbenchFiles() {
        this.workbenchFiles.clear();
        const workspaceRoot = StateManager.workspaceRoot;
        if (workspaceRoot) {
            let workbenchFiles = this.getWorkbenchFilesInDirectory(workspaceRoot);
            workbenchFiles.forEach(workbenchFile => {
                try {
                    const wbFile = JSON.parse(readFileSync(workbenchFile.fsPath, { encoding: 'utf-8' })) as ApolloWorkbenchFile;
                    this.workbenchFiles.set(workbenchFile.fsPath, wbFile);
                } catch (err) {
                    window.showErrorMessage(`Workbench file was not in the correct format. File located at ${workbenchFile.fsPath}`);
                }
            });
        }

        return this.workbenchFiles;
    }
    get currrentWorkbench() {
        return this.workbenchFiles.get(StateManager.instance.workspaceState_selectedWorkbenchFile.path) as ApolloWorkbenchFile;
    }
    get currrentWorkbenchSchemas() { return this.currrentWorkbench?.schemas; }
    get currrentWorkbenchOperations() { return this.currrentWorkbench?.operations; }
    get currrentWorkbenchOperationQueryPlans() { return this.currrentWorkbench?.queryPlans; }

    async promptOpenFolder() {
        let openFolder = "Open Folder";
        let response = await window.showErrorMessage("You must open a folder to create Apollo Workbench files", openFolder);
        if (response == openFolder)
            await commands.executeCommand('extension.openFolder');
    }

    //Workbench File Implementations
    async promptToCreateWorkbenchFileFromGraph(graphId: string, graphVariants: string[]) {
        if (!StateManager.workspaceRoot) {
            await this.promptOpenFolder();
        } else {
            let selectedVariant = '';

            if (graphVariants.length == 0) {
                selectedVariant = 'currrent'
            } else if (graphVariants.length == 1) {
                selectedVariant = graphVariants[0];
            } else {
                selectedVariant = await window.showQuickPick(graphVariants) ?? '';
            }

            if (selectedVariant == '') {
                window.showInformationMessage("You must select a variant to load the graph from");
            } else {
                let defaultGraphName = `${graphId}-${selectedVariant}-`;
                let graphName = await window.showInputBox({
                    prompt: "Enter a name for your new workbench file",
                    placeHolder: defaultGraphName,
                    value: defaultGraphName
                });
                if (graphName) {
                    let workbenchFile: ApolloWorkbenchFile = new ApolloWorkbenchFile();
                    workbenchFile.graphName = graphName;

                    let results = await getGraphSchemasByVariant(StateManager.instance.globalState_userApiKey, graphId, selectedVariant);
                    let monolithicService = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_NonFederatedImplementingService;
                    if (monolithicService?.graphID) {
                        workbenchFile.schemas['monolith'] = { sdl: results.service?.schema?.document, shouldMock: true, autoUpdateSchemaFromUrl: false };
                        ;
                    } else {
                        let implementingServices = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;
                        implementingServices?.services?.map(service => workbenchFile.schemas[service.name] = { sdl: service.activePartialSchema.sdl, url: service.url ?? "", shouldMock: true, autoUpdateSchemaFromUrl: false });
                    }

                    const path = resolve(StateManager.workspaceRoot, `${graphName}.apollo-workbench`);

                    const compositionResults = getComposedSchema(workbenchFile).next().value;
                    if (compositionResults) {
                        if (compositionResults.composedSdl) workbenchFile.composedSchema = compositionResults.composedSdl;
                        else await handleErrors(workbenchFile, compositionResults.errors);

                        this.workbenchFiles.set(path, workbenchFile);
                        writeFileSync(path, JSON.stringify(workbenchFile), { encoding: "utf8" });

                        StateManager.instance.localWorkbenchFilesProvider.refresh();
                    }
                } else {
                    window.showInformationMessage("You must provide a name to create a new workbench file")
                }
            }
        }
    }
    async promptToCreateWorkbenchFile() {
        if (!StateManager.workspaceRoot) {
            await this.promptOpenFolder();
        } else {
            let workbenchName = await window.showInputBox({ placeHolder: "Enter name for workbench file" });
            if (!workbenchName) {
                const msg = 'No name was provided for the file.\n Cancelling new workbench create';
                outputChannel.appendLine(msg);
                window.showErrorMessage(msg);
            } else {
                const filePath = FileProvider.instance.createNewWorkbenchFile(workbenchName);
                if (filePath) {
                    let shouldLoad = await window.showInformationMessage("Would you like to load the new workbench file?", "Yes");
                    if (shouldLoad?.toLowerCase() == "yes") {
                        await this.loadWorkbenchFile(workbenchName, filePath);
                    }
                }
            }
        }
    }
    async promptToDeleteWorkbenchFile(filePath: string) {
        let result = await window.showWarningMessage(`Are you sure you want to delete ${filePath}?`, { modal: true }, "Yes")
        if (result?.toLowerCase() != "yes") return;

        let selectedWbFile = StateManager.instance.workspaceState_selectedWorkbenchFile;
        if (selectedWbFile && selectedWbFile.path == filePath) {
            StateManager.instance.workspaceState_selectedWorkbenchFile = { name: "", path: "" };
        }

        this.workbenchFiles.delete(filePath);
        unlinkSync(filePath);

        StateManager.instance.localWorkbenchFilesProvider?.refresh();
    }
    async promptToRenameWorkbenchFile(oldGraphName: string, wbFilePath: string) {
        let result = await window.showInputBox({ prompt: "Enter what you want to rename your graph to", value: oldGraphName });
        if (!result) return;

        let shouldSelectAfterRename = false;
        if (result == this.currrentWorkbench?.graphName)
            shouldSelectAfterRename = true;

        let workbenchFileToRename = this.workbenchFiles.get(wbFilePath);
        if (workbenchFileToRename) {
            workbenchFileToRename.graphName = result;
            writeFileSync(wbFilePath, JSON.stringify(workbenchFileToRename), { encoding: "utf8" });

            if (shouldSelectAfterRename) {
                StateManager.instance.workspaceState_selectedWorkbenchFile = { name: workbenchFileToRename.graphName, path: wbFilePath };
            }

            StateManager.instance.localWorkbenchFilesProvider?.refresh();
        } else
            window.showErrorMessage(`Workbench file was not found in  virtual documents: ${wbFilePath}`);
    }
    createNewWorkbenchFile(workbenchFileName: string, graphName?: string) {
        if (StateManager.workspaceRoot) {
            const path = `${StateManager.workspaceRoot}/${workbenchFileName}.apollo-workbench`;
            const uri = Uri.parse(path);
            const wbFile = new ApolloWorkbenchFile();
            wbFile.graphName = graphName ?? workbenchFileName;

            this.workbenchFiles.set(uri.fsPath, wbFile);
            writeFileSync(uri.fsPath, JSON.stringify(wbFile));
            StateManager.instance.localWorkbenchFilesProvider?.refresh();

            return uri.fsPath;
        }
    }
    async duplicateWorkbenchFile(workbenchFileName: string, filePathToDuplicate: string) {
        if (StateManager.workspaceRoot) {
            let newWorkbenchFileName = await window.showInputBox({ prompt: "Enter the name for new workbench file", value: `${workbenchFileName}-copy` });
            if (newWorkbenchFileName) {
                const newUri = Uri.parse(`${StateManager.workspaceRoot}/${newWorkbenchFileName}.apollo-workbench`);
                const workbenchFileToDuplicate = this.workbenchFiles.get(filePathToDuplicate);
                if (workbenchFileToDuplicate) {
                    workbenchFileToDuplicate.graphName = newWorkbenchFileName;
                    this.workbenchFiles.set(newUri.fsPath, workbenchFileToDuplicate);

                    writeFileSync(newUri.fsPath, JSON.stringify(workbenchFileToDuplicate), { encoding: 'utf-8' });
                } else {
                    window.showInformationMessage(`Original workspace file not found: ${workbenchFileName}`);
                }
            }
        } else {
            window.showInformationMessage("No name entered, cancelling copy");
        }
    }
    async copyPreloadedWorkbenchFile(fileName: string) {
        if (!StateManager.workspaceRoot) {
            await this.promptOpenFolder();
        } else {
            let file = `${fileName}.apollo-workbench`;
            let preloadFileDir = join(__dirname, '..', '..', '..', 'media', `preloaded-files`, file);
            let workbenchFile = JSON.parse(readFileSync(preloadFileDir, { encoding: 'utf-8' })) as ApolloWorkbenchFile;
            workbenchFile.graphName = fileName;
            this.workbenchFiles.set(preloadFileDir, workbenchFile);
            await this.duplicateWorkbenchFile(fileName, preloadFileDir);
            this.workbenchFiles.delete(preloadFileDir);
            StateManager.instance.localWorkbenchFilesProvider?.refresh();
        }
    }
    async loadWorkbenchFile(workbenchFileName: string, filePath: string) {
        window.setStatusBarMessage("Loading Workbench File", 500);
        ServerManager.instance.stopMocks();
        let isCancelled = false;
        let lastEditor: any;
        while (window.activeTextEditor && window.visibleTextEditors.length > 0 && !isCancelled) {
            if (lastEditor == window.activeTextEditor) {
                let cancelledMessage = `Cancelled Loading WB:${workbenchFileName}`;
                console.log(cancelledMessage);
                window.setStatusBarMessage(cancelledMessage, 3000);
                return;
            } else {
                lastEditor = window.activeTextEditor;
                for (var i = 0; i < window.visibleTextEditors.length; i++) {
                    const editor = window.visibleTextEditors[i];
                    if (editor == window.activeTextEditor) {
                        await commands.executeCommand('workbench.action.closeActiveEditor');
                        continue;
                    }
                }
            }
        }
        compositionDiagnostics.clear();
        if (this.workbenchFiles.get(filePath)) {
            StateManager.instance.workspaceState_selectedWorkbenchFile = { name: workbenchFileName, path: filePath };

            //TODO: figure out blocking UI thread
            //  Ruled out try/catch blocks further down the stack
            //  Seems that composeAndValidate(sdls) is the culprit
            getComposedSchemaLogCompositionErrors().next();
        } else {
            window.showErrorMessage(`Worbench file ${workbenchFileName} does not exist at ${filePath}`);
            StateManager.instance.localWorkbenchFilesProvider.refresh();
        }
    }
    saveCurrentWorkbench(shouldRevertFile = true) {
        writeFileSync(StateManager.instance.workspaceState_selectedWorkbenchFile.path, JSON.stringify(this.currrentWorkbench), { encoding: "utf8" });
        StateManager.instance.currentWorkbenchSchemasProvider.refresh();
        StateManager.instance.currentWorkbenchOperationsProvider.refresh();
        window.setStatusBarMessage("Current Workbench Saved", 500);

        if (shouldRevertFile)
            commands.executeCommand('workbench.action.files.revert');
    }
    //Schema File Implementations
    async openSchema(serviceName: string) {
        await window.showTextDocument(WorkbenchUri.parse(serviceName));
    }
    async promptToAddSchema() {
        let serviceName = await window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!serviceName) {
            const message = `Create schema cancelled - No name entered.`;
            outputChannel.appendLine(message);
            window.setStatusBarMessage(message, 3000);
        } else {
            await this.addSchema(serviceName);
        }
    }
    async addSchema(serviceName: string) {
        this.currrentWorkbenchSchemas[serviceName] = { shouldMock: true, sdl: "", autoUpdateSchemaFromUrl: false };
        this.saveCurrentWorkbench();
        await this.openSchema(serviceName);
    }
    async renameSchema(serviceToRename: string) {
        let newServiceName = await window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!newServiceName) {
            const message = `Renaming schema cancelled ${serviceToRename} - No new name entered.`;
            outputChannel.appendLine(message);
            window.setStatusBarMessage(message, 3000);
        } else if (this.currrentWorkbenchSchemas[newServiceName]) {
            window.showErrorMessage(`Rename cancelled, there is already another service named ${newServiceName}`)
        } else {
            await this.rename(WorkbenchUri.parse(serviceToRename), WorkbenchUri.parse(newServiceName), { overwrite: true });
        }
    }
    async promptServiceUrl(serviceToUpdateUrl: string) {
        let serviceUrl = await window.showInputBox({ placeHolder: "Enter a the url for the schema/service" }) ?? "";
        if (!serviceUrl) {
            const message = `Set service URL cancelled for ${serviceToUpdateUrl} - No URL entered.`;
            outputChannel.appendLine(message);
            window.setStatusBarMessage(message, 3000);
        } else {
            if (this.currrentWorkbenchSchemas[serviceToUpdateUrl]) {
                this.currrentWorkbenchSchemas[serviceToUpdateUrl].url = serviceUrl;
                this.saveCurrentWorkbench();
            }
        }
    }
    shouldMockSchema(serviceToMock: string) {
        if (this.currrentWorkbenchSchemas[serviceToMock]) {
            this.currrentWorkbenchSchemas[serviceToMock].shouldMock = true;
            this.saveCurrentWorkbench();
        }
    }
    async disableMockSchema(serviceToMock: string) {
        if (this.currrentWorkbenchSchemas[serviceToMock]) {
            if (!this.currrentWorkbenchSchemas[serviceToMock].url)
                await this.promptServiceUrl(serviceToMock);

            if (this.currrentWorkbenchSchemas[serviceToMock].url) {
                this.currrentWorkbenchSchemas[serviceToMock].shouldMock = false;
                this.saveCurrentWorkbench();
            } else {
                window.showErrorMessage("You must set a url for the service if you want to disable mocks. The URL will be used to direct traffic and update the schema in the workbench file.");
            }
        }
    }
    async updateSchemaFromUrl(serviceToUpdateUrl: string) {
        if (StateManager.settings_tlsRejectUnauthorized) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        if (!this.currrentWorkbenchSchemas[serviceToUpdateUrl].url) {
            await this.promptServiceUrl(serviceToUpdateUrl);
        }

        if (this.currrentWorkbenchSchemas[serviceToUpdateUrl].url) {
            const sdl = await OverrideApolloGateway.getTypeDefs(this.currrentWorkbenchSchemas[serviceToUpdateUrl].url ?? "", serviceToUpdateUrl);
            if (sdl) {
                this.currrentWorkbenchSchemas[serviceToUpdateUrl].sdl = sdl;
                this.saveCurrentWorkbench();
                let editor = await window.showTextDocument(WorkbenchUri.parse(serviceToUpdateUrl, WorkbenchUriType.SCHEMAS));
                if (editor) {
                    const document = editor.document;
                    await editor.edit((editor) => {
                        editor.replace(new Range(0, 0, document.lineCount, 0), sdl);
                    });
                    await document.save();
                }
            }
        } else {//No URL entered for schema
            window.showErrorMessage("You must set a url for the service if you want to update the schema from it.");
        }
    }
    //Operation File Implementations
    async openOperation(operationName: string) {
        await window.showTextDocument(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERIES));
    }
    async promptToAddOperation() {
        let operationName = await window.showInputBox({ placeHolder: "Enter a unique name for the operation" }) ?? "";
        if (!operationName) {
            const message = `Create operation cancelled - No name entered.`;
            outputChannel.appendLine(message);
            window.setStatusBarMessage(message, 3000);
        } else {
            await FileProvider.instance.addOperation(operationName);
        }
    }
    async addOperation(operationName: string, operationSignature?: string) {
        if (!operationSignature) operationSignature = `query ${operationName} {\n\t\n}`
        else operationSignature = print(parse(operationSignature));

        this.currrentWorkbenchOperations[operationName] = operationSignature;
        await this.writeFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERIES), Buffer.from(operationSignature), { create: true, overwrite: true });
        await this.openOperation(operationName);
    }
    async renameOperation(operationToRename: string) {
        let newOperationName = await window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!newOperationName) {
            const message = `Renaming schema cancelled for ${operationToRename} - No new name entered.`;
            outputChannel.appendLine(message);
            window.setStatusBarMessage(message, 3000);
        } else if (this.currrentWorkbenchOperations[newOperationName]) {
            window.showErrorMessage(`Rename cancelled, there is already another operation named ${newOperationName}`)
        } else {
            await this.rename(WorkbenchUri.parse(operationToRename, WorkbenchUriType.QUERIES), WorkbenchUri.parse(newOperationName, WorkbenchUriType.QUERIES), { overwrite: true });
        }
    }
    //Operation Query Plan File Implementations
    async openOperationQueryPlan(operationName: string) {
        await window.showTextDocument(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERY_PLANS));
    }
    generateQueryPlan(operationName: string) {
        if (!this.currrentWorkbench.composedSchema) return;

        try {
            const operation = this.currrentWorkbenchOperations[operationName];
            const queryPlanPointer = getQueryPlanner(this.currrentWorkbench.composedSchema);
            const queryPlan = getQueryPlan(queryPlanPointer, operation, { autoFragmentization: false });

            this.currrentWorkbench.queryPlans[operationName] = serializeQueryPlan(queryPlan);
        } catch (err) {
            console.log(err);
        }
    }
    //FileSystemProvider Implementations
    //File chagnes are watched at the `vscode.workspace.onDidChangeTextDocument` level
    readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
        if (this.currrentWorkbench) {
            if (uri.path.includes('/schemas')) {
                const serviceName = uri.query;
                if (!this.currrentWorkbenchSchemas[serviceName]) throw new Error(`Trying to read schema file for ${serviceName}, but it isn't in the current workbench file`);

                const schema = this.currrentWorkbenchSchemas[serviceName].sdl;
                return Buffer.from(schema);
            } else if (uri.path.includes('/settings-schemas')) {
                const serviceName = uri.query;
                if (!this.currrentWorkbenchSchemas[serviceName]) throw new Error(`Trying to read schema file for ${serviceName}, but it isn't in the current workbench file`);

                const service = this.currrentWorkbenchSchemas[serviceName];
                let settings: WorkbenchSettings = {
                    url: service.url ?? '',
                    requiredHeaders: service.requiredHeaders ?? [],
                    mocks: {
                        shouldMock: service.shouldMock ?? true,
                        autoUpdateSchemaFromUrl: service.autoUpdateSchemaFromUrl ?? false
                    }
                };

                return Buffer.from(JSON.stringify(settings, null, 2));
            } else if (uri.path.includes('/queries')) {
                const operationName = uri.query;
                const operation = this.currrentWorkbenchOperations[operationName];
                return Buffer.from(operation);
            } else if (uri.path.includes('/queryplans')) {
                const operationName = uri.query;
                let queryPlan = this.currrentWorkbenchOperationQueryPlans[operationName];
                if (queryPlan)
                    return Buffer.from(queryPlan);
                else {
                    this.generateQueryPlan(operationName);
                    queryPlan = this.currrentWorkbenchOperationQueryPlans[operationName];
                    if (queryPlan) {
                        this.saveCurrentWorkbench();
                        return Buffer.from(queryPlan);
                    }
                }

                return Buffer.from('Either there is no valid composed schema or the query is not valid\nUnable to generate query plan');
            } else if (uri.path == '/csdl.graphql') {
                return Buffer.from(this.currrentWorkbench.composedSchema);
            }
        }
        throw new Error('No workbench currently selected');
    }
    writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        if (this.currrentWorkbench && uri.scheme == 'workbench' && !uri.path.includes('queryplans')) {
            const stringContent = content.toString();
            if (uri.path.includes('/schemas')) {
                const serviceName = uri.query;
                this.currrentWorkbenchSchemas[serviceName].sdl = stringContent;

                //Come up with your list of things to be used in linting

                //Parse individual file
                //  This should include the 3 criteria:
                //      1. missing @external
                //      2. extending a type with no @key defined
                //      3. mismastched value types/enums
                //If Individual file is valid sdl, then try composition
                //  Remove individual parse errors from composition errors
                getComposedSchemaLogCompositionErrors().next();
            } else if (uri.path.includes('/settings-schemas')) {
                const serviceName = uri.query;
                const savedSettings: WorkbenchSettings = JSON.parse(stringContent);

                this.currrentWorkbenchSchemas[serviceName].url = savedSettings.url;
                this.currrentWorkbenchSchemas[serviceName].shouldMock = savedSettings.mocks.shouldMock;
                this.currrentWorkbenchSchemas[serviceName].autoUpdateSchemaFromUrl = savedSettings.mocks.autoUpdateSchemaFromUrl;
                this.currrentWorkbenchSchemas[serviceName].requiredHeaders = savedSettings.requiredHeaders;
            } else if (uri.path.includes('/queries')) {
                const operationName = uri.query;
                this.currrentWorkbenchOperations[operationName] = stringContent;
                this.generateQueryPlan(operationName);
            } else if (uri.path == '/csdl.graphql') {
                this.currrentWorkbench.composedSchema = stringContent;
            } else {
                throw new Error('Unknown uri format')
            }

            this.saveCurrentWorkbench();
        }
    }
    delete(uri: Uri, options: { recursive: boolean; }): void | Thenable<void> {
        if (this.currrentWorkbench && uri.scheme == 'workbench') {
            if (uri.path.includes('/schemas')) {
                const serviceName = uri.query;
                delete this.currrentWorkbenchSchemas[serviceName];
            } else if (uri.path.includes('/queries')) {
                const operationName = uri.query;
                delete this.currrentWorkbenchOperations[operationName];
            } else {
                throw new Error('Unknown uri format')
            }

            window.showTextDocument(uri, { preview: true, preserveFocus: false })
                .then(() => commands.executeCommand('workbench.action.closeActiveEditor'));

            this.saveCurrentWorkbench(false);
        }
    }
    rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        if (this.currrentWorkbench && oldUri.scheme == 'workbench' && newUri.scheme == 'workbench') {
            const oldName = oldUri.query;
            const newName = newUri.query;

            if (oldUri.path.includes('/schemas')) {
                this.currrentWorkbenchSchemas[newName] = this.currrentWorkbenchSchemas[oldName];
                delete this.currrentWorkbenchSchemas[oldName];

                getComposedSchemaLogCompositionErrors().next();
            } else if (oldUri.path.includes('/queries')) {
                this.currrentWorkbenchOperations[newName] = this.currrentWorkbenchOperations[oldName];
                delete this.currrentWorkbenchOperations[oldName];
            } else {
                throw new Error('Unknown uri format')
            }

            this.saveCurrentWorkbench();
        }
    }
    watch(uri: Uri, options: { recursive: boolean; excludes: string[]; }): Disposable {
        return new Disposable(() => { });
    }
    stat(uri: Uri): FileStat | Thenable<FileStat> {
        const now = Date.now();
        return {
            ctime: now,
            mtime: now,
            size: 0,
            type: FileType.File
        }
    }
    readDirectory(uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
        throw new Error('Method not implemented.');
    }
    createDirectory(uri: Uri): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
    onDidChangeEmitter = new EventEmitter<FileChangeEvent[]>();
    onDidChangeFile = this.onDidChangeEmitter.event;


    private getWorkbenchFilesInDirectory(dirPath: string) {
        if (!dirPath || dirPath == '.') return [];

        let workbenchFiles = new Array<Uri>();
        let directories = new Array<string>();
        directories.push(dirPath);

        while (directories.length > 0) {
            let directory = directories[0];
            const dirents = readdirSync(directory, { withFileTypes: true });
            for (const dirent of dirents) {
                const directoryPath = path.resolve(directory, dirent.name);
                if (dirent.isDirectory() && dirent.name != 'node_modules') {
                    directories.push(directoryPath);
                } else if (dirent.name.includes('.apollo-workbench')) {
                    workbenchFiles.push(Uri.parse(directoryPath));
                }
            }

            directories.splice(0, 1);
        }

        return workbenchFiles;
    }

    getPreloadedWorkbenchFiles() {
        let items: { fileName: string, path: string }[] = [];
        let preloadFileDir = join(__dirname, '..', '..', '..', 'media', `preloaded-files`);
        if (existsSync(preloadFileDir)) {
            let preloadedDirectory = readdirSync(preloadFileDir, { encoding: 'utf-8' });
            preloadedDirectory.map(item => {
                items.push({ fileName: item.split('.')[0], path: `${preloadFileDir}/${item}` });
            });
        }
        return items;
    }
}