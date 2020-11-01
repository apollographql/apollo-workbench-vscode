import * as vscode from 'vscode';
const chokidar = require('chokidar');

import { newWorkbench } from './workbench/new';

import { loadFile } from './workbench/local-workbench-files/loadFile';
import { LocalWorkbenchFilesTreeDataProvider, WorkbenchFileTreeItem } from './workbench/local-workbench-files/localWorkbenchFilesTreeDataProvider';

import { createSchemaFile } from './workbench/current-workbench/createSchemaFile';
import { editSchema } from './workbench/current-workbench/editSchema';
import { CurrentWorkbenchTreeDataProvider } from './workbench/current-workbench/currentWorkbenchTreeDataProvider';
import { stopMocks } from './workbench/setup';
import { FileWatchManager } from './workbench/fileWatchManager';

export interface ApolloWorkbench {
	graphName: string;
	queries: any;
	schemas: any;
	composedSchema: string;
}

const fileWatchManager = new FileWatchManager();
export const outputChannel = vscode.window.createOutputChannel("Apollo Workbench");
console.log = function (str) { //Redirect console.log to Output tab in extension
	outputChannel.appendLine(str);
};

export function activate(context: vscode.ExtensionContext) {
	const localWorkbenchFilesProvider = new LocalWorkbenchFilesTreeDataProvider(vscode.workspace.rootPath ?? ".");
	const currentWorkbenchProvider = new CurrentWorkbenchTreeDataProvider(vscode.workspace.rootPath ?? ".", context);

	//Global Extension Commands
	const newWorkbenchCommand = vscode.commands.registerCommand('extension.newWorkbench', async () => { newWorkbench(localWorkbenchFilesProvider) });
	const startWorkbenchCommand = vscode.commands.registerCommand('extension.startWorkbench', async () => {
		await fileWatchManager.reset();
		fileWatchManager.start(context);
		outputChannel.appendLine('Workbench watcher started');
	});
	const stopWorkbenchCommand = vscode.commands.registerCommand('extension.stopWorkbench', async () => {
		await fileWatchManager.reset();
		outputChannel.appendLine('Workbench watcher stopped');
		stopMocks();
		outputChannel.appendLine('Workbench stopped');
	})

	context.subscriptions.push(newWorkbenchCommand);
	context.subscriptions.push(startWorkbenchCommand);
	context.subscriptions.push(stopWorkbenchCommand);

	//Current Loaded Workbench Commands
	vscode.window.registerTreeDataProvider('current-workbench', currentWorkbenchProvider);
	const addSchemaToWorkbenchCommand = vscode.commands.registerCommand('current-workbench.addSchema', async () => await createSchemaFile(context, currentWorkbenchProvider));
	const editSchemaInWorkbenchCommand = vscode.commands.registerCommand("current-workbench.editSchema", editSchema);
	const deleteSchemaFromWorkbenchCommand = vscode.commands.registerCommand("current-workbench.deleteSchema", () => console.log('delete file'));
	const refreshSelectedWorkbenchFilesCommand = vscode.commands.registerCommand('current-workbench.refreshFile', async () => currentWorkbenchProvider.refresh());

	context.subscriptions.push(addSchemaToWorkbenchCommand);
	context.subscriptions.push(editSchemaInWorkbenchCommand);
	context.subscriptions.push(deleteSchemaFromWorkbenchCommand);
	context.subscriptions.push(refreshSelectedWorkbenchFilesCommand);

	//Local Workbench Files Commands
	vscode.window.registerTreeDataProvider('local-workbench-files', localWorkbenchFilesProvider);
	vscode.commands.registerCommand("local-workbench-files.loadFile", (item: WorkbenchFileTreeItem) => { loadFile(item, context, currentWorkbenchProvider) });

	const refreshLocalWorkbenchFilesCommand = vscode.commands.registerCommand('local-workbench-files.refresh', async () => localWorkbenchFilesProvider.refresh());

	context.subscriptions.push(refreshLocalWorkbenchFilesCommand);
}
