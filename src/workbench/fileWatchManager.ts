import * as vscode from 'vscode';
const chokidar = require('chokidar');
import { updateQueryPlan } from './updateQueryPlan';
import { ApolloWorkbench, compositionDiagnostics, outputChannel, WorkbenchSchema } from '../extension';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { parse, print } from 'graphql';
import { StateManager } from './stateManager';
import { ServerManager } from './serverManager';

import { WorkbenchFileManager } from './workbenchFileManager';

export class FileWatchManager {
    private schemasWatcher = chokidar.watch();
    private queryWatcher = chokidar.watch();

    async start() {
        vscode.window.setStatusBarMessage('Starting Workbench...Reset');
        await this.reset();
        vscode.window.setStatusBarMessage('Workbench Reset...Syncing Files');
        vscode.window.setStatusBarMessage('Workbench File Sync Complete...Starting Listeners');

        this.schemasWatcher.add(WorkbenchFileManager.workspaceSchemasFolderPath())
            .on('ready', () => ServerManager.instance.startMocks())
            .on('change', (path) => this.updateSchema(path))
            .on('unlink', (path: any) => this.deleteSchema(path))
            .on('add', (path: any) => this.addSchema(path));
        this.queryWatcher.add(WorkbenchFileManager.workspaceQueriesFolderPath())
            .on('change', (path: any) => updateQueryPlan(path))
            .on('unlink', (path: any) => this.deleteOperationPath(path))
            .on('ready', (path: any) => updateQueryPlan(path));

        vscode.window.setStatusBarMessage('Workbench is running');
    }
    async reset() {
        if (this.schemasWatcher?._eventsCount > 0)
            await this.schemasWatcher.close();

        this.schemasWatcher = chokidar.watch();
        outputChannel.appendLine('Workbench Reset');
    }
    async stop() {
        await this.reset();

        vscode.window.setStatusBarMessage('');
        vscode.window.setStatusBarMessage('Workbench is stopped', 5000);
        outputChannel.appendLine('Workbench Stopped');

        ServerManager.instance.stopMocks();
    }

    async createSchema() {
        let serviceName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
        if (!serviceName) {
            outputChannel.appendLine(`Create schema cancelled - No name entered.`);
        } else {
            try {
                let workbenchFile = this.wrapWorkbenchInErrorDialog();
                if (workbenchFile) {
                    while (workbenchFile.schemas[serviceName]) {
                        outputChannel.appendLine(`${serviceName} already exists. Schema/Service name must be unique within a workbench file`);
                        serviceName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                        vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
                    }

                    this.saveNewSchema(serviceName, workbenchFile);
                }
            } catch (err) {
                console.log(err);
            }
        }
    }
    addSchema(path: string) {
        if (!path || !path.includes('.graphql') || path == '.graphql') return;

        let workbenchFile = this.wrapWorkbenchInErrorDialog();
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            if (!workbenchFile.schemas[serviceName])
                this.saveNewSchema(serviceName, workbenchFile);
        }
    }


    private saveNewSchema(serviceName: string, workbenchFile: ApolloWorkbench) {
        workbenchFile.schemas[serviceName] = new WorkbenchSchema();
        writeFileSync(`${WorkbenchFileManager.workspaceSchemasFolderPath()}/${serviceName}.graphql`, JSON.stringify(workbenchFile.schemas[serviceName]), { encoding: 'utf-8' })
        WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
        StateManager.currentWorkbenchSchemasProvider.refresh();
    }

    deleteSchema(path: string) {
        if (!path || !path.includes('.graphql')) return;

        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            ServerManager.instance.stopServerByName(serviceName);

            WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
            vscode.window.withProgress({ title: "Running composition", location: vscode.ProgressLocation.Notification }, (progress, token) => {
                return new Promise(resolve => {
                    ServerManager.instance.getComposedSchemaLogCompositionErrors(workbenchFile as ApolloWorkbench);
                    resolve();
                })
            });
        }
    }

    updateSchema(path: string) {
        if (!path || !path.includes('.graphql') || path == '.graphql') return;

        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            if (workbenchFile.schemas[serviceName].shouldMock) {
                let localSchemaString = WorkbenchFileManager.getLocalSchemaFromFile(serviceName);
                if (localSchemaString != workbenchFile.schemas[serviceName].sdl) {
                    workbenchFile.schemas[serviceName].sdl = localSchemaString;

                    ServerManager.instance.startServer(serviceName, localSchemaString);
                    WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);

                    vscode.window.withProgress({ title: "Running composition", location: vscode.ProgressLocation.Notification }, (progress, token) => {
                        return new Promise(resolve => {
                            ServerManager.instance.getComposedSchemaLogCompositionErrors(workbenchFile as ApolloWorkbench);
                            resolve();
                        })
                    });
                }
            }
        }
    }

    deleteOperationPath(path: string) {
        if (existsSync(path)) {
            let path1 = path.split('.queryplan')[0];
            let path2 = path1.split('/');
            let operationname = path2[path2.length - 1];

            this.deleteOperation(operationname);
        }
    }

    deleteOperation(operationName: string) {
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            delete workbenchFile.operations[operationName];
            delete workbenchFile.queryPlans[operationName];

            unlinkSync(`${WorkbenchFileManager.workspaceQueriesFolderPath()}/${operationName}.graphql`);
            unlinkSync(`${WorkbenchFileManager.workspaceQueriesFolderPath()}/${operationName}.queryplan`);

            WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
            StateManager.currentWorkbenchOperationsProvider?.refresh();
        }
    }

    async editOperation(operationName: string) {
        outputChannel.appendLine(`Selected Operation ${operationName}`);
        const workbenchQueriesFolder = WorkbenchFileManager.workspaceQueriesFolderPath();
        const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${operationName}.graphql`);
        await vscode.window.showTextDocument(uri);
        StateManager.apolloStudioGraphOpsProvider?.refresh();
    }

    async addOperation(operationName?: string, operationSignature?: string) {
        if (!operationName)
            operationName = await vscode.window.showInputBox({ placeHolder: "Enter a operation name for the query or mutation" }) ?? "";

        if (!operationName) {
            outputChannel.appendLine(`Create operation cancelled - No name entered.`);
        } else {
            let wb = WorkbenchFileManager.getSelectedWorkbenchFile();
            if (wb) {
                while (wb?.schemas[operationName]) {
                    outputChannel.appendLine(`${operationName} already exists. Schema/Service name must be unique within a workbench file`);
                    operationName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                }

                wb.operations[operationName] = operationSignature ? print(parse(operationSignature)) : `query ${operationName} {\n\n}`;
                wb.queryPlans[operationName] = "";

                WorkbenchFileManager.saveSelectedWorkbenchFile(wb);
                StateManager.localWorkbenchFilesProvider?.refresh();
                StateManager.currentWorkbenchOperationsProvider?.refresh();
            } else
                vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
        }
    }
    async openOperationQueryPlan(operationName: string) {
        outputChannel.appendLine(`Opening query plan for operation ${operationName}`);
        const workbenchQueriesFolder = WorkbenchFileManager.workspaceQueriesFolderPath();
        const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${operationName}.queryplan`);
        await vscode.window.showTextDocument(uri);
    }

    async newWorkbenchFileFromGraph(graphId: string, graphVariants: string[]) {
        let selectedVariant = '';
        if (graphVariants.length == 0) {
            selectedVariant = 'currrent'
        } else if (graphVariants.length == 1) {
            selectedVariant = graphVariants[0];
        } else {
            selectedVariant = await vscode.window.showQuickPick(graphVariants) ?? '';
        }

        if (selectedVariant == '') {
            vscode.window.showInformationMessage("You must select a variant to load the graph from")
        } else {
            let defaultGraphName = `${graphId}@${selectedVariant}-v?`;
            let graphName = await vscode.window.showInputBox({
                prompt: "Enter a name for your new workbench file",
                placeHolder: defaultGraphName,
                value: defaultGraphName
            });
            outputChannel.appendLine(`Creating workbench file ${graphName}`);
            WorkbenchFileManager.newWorkbenchFileFromGraph(graphName ?? defaultGraphName, graphId, selectedVariant);
        }
    }
    async newWorkbenchFile() {
        outputChannel.appendLine('Creating new workbench file...');

        let workbenchName = await vscode.window.showInputBox({ placeHolder: "Enter name for workbench file" });
        if (!workbenchName) {
            const msg = 'No name was provided for the file.\n Cancelling new workbench create';
            outputChannel.appendLine(msg);
            vscode.window.showErrorMessage(msg);
        } else {
            WorkbenchFileManager.newWorkbenchFile(workbenchName);
        }
    }

    async loadWorkbenchFile(workbenchFileName: string, filePath: string) {
        let key = `Loading WB:${workbenchFileName}`;
        outputChannel.appendLine(`Loading WB:${workbenchFileName} - ${filePath}`);
        vscode.window.setStatusBarMessage(`Loading WB:${workbenchFileName}`);
        vscode.window.withProgress({ title: "Loading workbench file", location: vscode.ProgressLocation.Notification }, async (progress, token) => {
            for (var i = 0; i < vscode.window.visibleTextEditors.length; i++) {
                const editor = vscode.window.visibleTextEditors[i];
                if (editor.document.isDirty && !editor.document.isUntitled) {
                    await vscode.window.showTextDocument(editor.document);
                    let response = await vscode.window.showWarningMessage("Would you like to save your chagnes?", "Yes", "No");
                    if (response === "Yes") {
                        await editor.document.save();
                    } else if (response === "No") {

                    } else {
                        return;
                    }
                }
            }

            compositionDiagnostics.clear();

            vscode.window.setStatusBarMessage(`${key}-Stopping Existing Mocks`);
            await this.stop();
            vscode.window.setStatusBarMessage(`${key}-Existing Mocks Stopped`);
            await WorkbenchFileManager.deleteWorkbenchFolder();
            StateManager.updateSelectedWorkbenchFile(workbenchFileName, filePath);
            this.migrateWorkbenchFileToNext();
            vscode.window.setStatusBarMessage(`${key}-Starting Mocks`);
            await this.start();
            vscode.window.setStatusBarMessage(`${key}-Mocks Started`, 250);

            return new Promise(resolve => {
                ServerManager.instance.getComposedSchemaLogCompositionErrors();
                resolve();
            });
        });
    }

    migrateWorkbenchFileToNext() {
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let shouldSave = false;
            for (var serviceName in workbenchFile.schemas) {
                let workbenchServiceSchema = workbenchFile.schemas[serviceName];
                if (typeof workbenchServiceSchema === 'string') {
                    //We have a workbench file that uses the legacy format, update
                    workbenchFile.schemas[serviceName] = new WorkbenchSchema(workbenchServiceSchema);
                    shouldSave = true;
                }
            }

            if (shouldSave)
                WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
        }
    }

    wrapWorkbenchInErrorDialog() {
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            return workbenchFile;
        } else {
            outputChannel.appendLine(`No workbench file is currently loaded.`);
            vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
        }
    }
}