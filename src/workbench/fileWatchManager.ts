import * as vscode from 'vscode';
const chokidar = require('chokidar');
import { setupMocks, stopMocks, stopServer, startServer, getComposedSchemaLogCompositionErrors, startGateway } from '../workbench/setup';
import { updateQueryPlan } from './updateQueryPlan';
import { outputChannel } from '../extension';
import { getLocalSchemaFromFile, getSelectedWorkbenchFile, getWorkbenchFile, saveSelectedWorkbenchFile, saveWorkbenchFile, workspaceQueriesFolderPath, workspaceSchemasFolderPath } from '../helpers';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { CurrentWorkbenchOpsTreeDataProvider, WorkbenchOperationTreeItem } from './current-workbench-queries/currentWorkbenchOpsTreeDataProvider';
import { gql } from '@apollo/client/core';
import { parse, print } from 'graphql';
import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFile, WorkbenchFileTreeItem } from './local-workbench-files/localWorkbenchFilesTreeDataProvider';
import { CurrentWorkbenchSchemasTreeDataProvider } from './current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { ApolloStudioGraphsTreeDataProvider } from './studio-graphs/apolloStudioGraphsTreeDataProvider';
import { ApolloStudioGraphOpsTreeDataProvider } from './studio-operations/apolloStudioGraphOpsTreeDataProvider';

export class FileWatchManager {
    extensionContext?: vscode.ExtensionContext;
    localWorkbenchFilesProvider?: LocalWorkbenchFilesTreeDataProvider;
    currentWorkbenchSchemasProvider?: CurrentWorkbenchSchemasTreeDataProvider;
    currentWorkbenchOperationsProvider?: CurrentWorkbenchOpsTreeDataProvider;
    apolloStudioGraphsProvider?: ApolloStudioGraphsTreeDataProvider;
    apolloStudioGraphOpsProvider?: ApolloStudioGraphOpsTreeDataProvider;

    private schemasWatcher = chokidar.watch();
    private queryWatcher = chokidar.watch();

    async start() {
        await this.reset();
        this.syncGraphQLFilesToWorkbenchFile();

        this.schemasWatcher.add(workspaceSchemasFolderPath())
            .on('ready', () => setupMocks(this.extensionContext))
            .on('change', (path) => this.updateSchema(path))
            .on('unlink', (path: any) => this.deleteSchema(path))
            .on('add', (path: any) => this.addSchema(path));
        this.queryWatcher.add(workspaceQueriesFolderPath())
            .on('change', (path: any) => updateQueryPlan(path, this.extensionContext))
            .on('ready', (path: any) => updateQueryPlan(path, this.extensionContext))
            .on('add', (path: any) => updateQueryPlan(path, this.extensionContext));

        vscode.window.setStatusBarMessage('Workbench is running');
        vscode.window.showInformationMessage('Workbench is running in the background', 'Stop').then((value) => {
            if (value == 'Stop')
                this.stop();
        });
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

        stopMocks();
    }

    syncGraphQLFilesToWorkbenchFile() {
        outputChannel.appendLine('Syncing GraphQL files in schemas folder to workbench file...');
        let generatedSchemasFolder = workspaceSchemasFolderPath();
        let selectedWbFile = this.extensionContext?.workspaceState.get('selectedWbFile');

        let workbenchFile = getWorkbenchFile((selectedWbFile as any)?.path);
        let graphqlFilesFolder = readdirSync(generatedSchemasFolder, { encoding: "utf8" });

        graphqlFilesFolder.map(fileName => {
            if (fileName.includes('.graphql')) {
                let serviceName = fileName.slice(0, -8);
                let typeDefsString = readFileSync(resolve(generatedSchemasFolder, fileName), { encoding: "utf8" });
                if (workbenchFile.schemas[serviceName]) {
                    if (typeDefsString != workbenchFile.schemas[serviceName]) {
                        workbenchFile.schemas[serviceName] = typeDefsString;
                    }
                } else {
                    workbenchFile.schemas[serviceName] = typeDefsString;
                }
            }
        });

        for (var key in workbenchFile.schemas) {
            let localSchemaFilePath = resolve(generatedSchemasFolder, `${key}.graphql`);
            if (!existsSync(localSchemaFilePath))
                writeFileSync(localSchemaFilePath, workbenchFile.schemas[key], { encoding: "utf8" });
        }

        saveSelectedWorkbenchFile(workbenchFile, this.extensionContext);

        outputChannel.appendLine('Workebench file synced with local folders');
    }

    addSchema(path: string) {
        if (!path || !path.includes('.graphql') || path == '.graphql') return;

        let workbenchFile = getSelectedWorkbenchFile(this.extensionContext);
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            if (!workbenchFile.schemas[serviceName]) {
                workbenchFile.schemas[serviceName] = "";
                writeFileSync(`${workspaceSchemasFolderPath()}/${serviceName}.graphql`, '', { encoding: 'utf-8' })
                saveSelectedWorkbenchFile(workbenchFile, this.extensionContext);
            }
        }
    }

    deleteSchema(path: string) {
        if (!path || !path.includes('.graphql')) return;

        let workbenchFile = getSelectedWorkbenchFile(this.extensionContext);
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            stopServer(serviceName);

            saveSelectedWorkbenchFile(workbenchFile, this.extensionContext);
            getComposedSchemaLogCompositionErrors(workbenchFile);
        }
    }

    updateSchema(path: string) {
        if (!path || !path.includes('.graphql') || path == '.graphql') return;

        let workbenchFile = getSelectedWorkbenchFile(this.extensionContext);
        if (workbenchFile) {
            let path1 = path.split('.graphql')[0];
            let path2 = path1.split('/');
            let serviceName = path2[path2.length - 1];

            console.log(`Setting up ${serviceName}`);

            let localSchemaString = getLocalSchemaFromFile(serviceName);
            workbenchFile.schemas[serviceName] = localSchemaString;

            startServer(serviceName);
            saveSelectedWorkbenchFile(workbenchFile, this.extensionContext);

            getComposedSchemaLogCompositionErrors(workbenchFile);
            startGateway();
        }
    }

    deleteOperation(operationName: string) {
        let workbenchFile = getSelectedWorkbenchFile(this.extensionContext);
        if (workbenchFile) {
            delete workbenchFile.operations[operationName];
            unlinkSync(`${workspaceQueriesFolderPath()}/${operationName}.graphql`);

            saveSelectedWorkbenchFile(workbenchFile, this.extensionContext);
            this.apolloStudioGraphOpsProvider?.refresh();
        }
    }

    async editOperation(operationName: string) {
        outputChannel.appendLine(`Selected Operation ${operationName}`);
        const workbenchQueriesFolder = workspaceQueriesFolderPath();
        const uri = vscode.Uri.parse(`${workbenchQueriesFolder}/${operationName}.graphql`);
        await vscode.window.showTextDocument(uri);
        this.apolloStudioGraphOpsProvider?.refresh();
    }

    async createOperation(context: vscode.ExtensionContext, operationName?: string, operationSignature?: string) {
        if (!operationName)
            operationName = await vscode.window.showInputBox({ placeHolder: "Enter a operation name for the query or mutation" }) ?? "";

        if (!operationName) {
            outputChannel.appendLine(`Create operation cancelled - No name entered.`);
        } else {
            let wb = getSelectedWorkbenchFile(context);
            if (wb) {
                while (wb?.schemas[operationName]) {
                    outputChannel.appendLine(`${operationName} already exists. Schema/Service name must be unique within a workbench file`);
                    operationName = await vscode.window.showInputBox({ placeHolder: "Enter a unique name for the schema/service" }) ?? "";
                    vscode.window.showErrorMessage('You must select a workbench file from the list of local workbench files found or you can create a new workbench file');
                }

                wb.operations[operationName] = operationSignature ? print(parse(operationSignature)) : `query ${operationName} {\n\n}`;
                wb.queryPlans[operationName] = "";

                saveSelectedWorkbenchFile(wb, context);
                this.localWorkbenchFilesProvider?.refresh();
            }
        }
    }

    async deleteWorkbenchFile(filePath: string) {
        let result = await vscode.window.showWarningMessage(`Are you sure you want to delete ${filePath}?`, { modal: true }, "Yes")
        if (result?.toLowerCase() != "yes") return;

        outputChannel.appendLine(`Deleting WB: ${filePath}`);
        let selectedWbFile = this.extensionContext?.workspaceState.get("selectedWbFile") as WorkbenchFile;
        if (selectedWbFile && selectedWbFile.path == filePath) {
            this.extensionContext?.workspaceState.update("selectedWbFile", "");

            this.currentWorkbenchSchemasProvider?.refresh();
            this.currentWorkbenchOperationsProvider?.refresh();
        }

        unlinkSync(filePath);
        this.localWorkbenchFilesProvider?.refresh();
    }
}