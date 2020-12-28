import * as assert from 'assert';

import { activateExtension, cleanupWorkbenchFiles } from './helpers';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';
import { NotLoggedInTreeItem } from '../../workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';

suite('Default Workbench Tests', () => {
    before(activateExtension);

    it('Defaults:LocalWorkbenchFiles - Getting Started is displayed', async function () {
        //Setup
        cleanupWorkbenchFiles();

        //Get TreeView children
        const localWorkbenchTreeItems = await StateManager.instance.localWorkbenchFilesProvider.getChildren();

        //Assert
        assert.strictEqual(localWorkbenchTreeItems.length, 1);
        assert.notStrictEqual(localWorkbenchTreeItems[0] as GettingStartedTopLevel, undefined);
    });
    it('Defaults:WorkbenchSchemaFiles - Should display no workbench file selected', async function () {
        //Setup
        cleanupWorkbenchFiles();

        //Get TreeView children
        const currentWorkbenchSchemasTreeItems = await StateManager.instance.currentWorkbenchSchemasProvider.getChildren();

        assert.strictEqual(currentWorkbenchSchemasTreeItems.length, 1);
        assert.strictEqual(currentWorkbenchSchemasTreeItems[0]?.label, 'No workbench file selected');
    });
    it('Defaults:WorkbenchQueryFiles - Should display no workbench file selected', async function () {
        //Setup
        cleanupWorkbenchFiles();

        //Get TreeView children
        const currentWorkbenchOperationsTreeItems = await StateManager.instance.currentWorkbenchOperationsProvider.getChildren();

        assert.strictEqual(currentWorkbenchOperationsTreeItems.length, 1);
        assert.strictEqual(currentWorkbenchOperationsTreeItems[0]?.label, 'No workbench file selected');
    });

    it('Defaults:StudioGraphs - Should display login item', async function () {
        //Setup
        StateManager.instance.globalState_userApiKey = "";

        //Get TreeView children
        const studioGraphTreeItems = await StateManager.instance.apolloStudioGraphsProvider.getChildren();

        //Assert
        studioGraphTreeItems.forEach(studioGraphTreeItem => assert.notStrictEqual(studioGraphTreeItem as NotLoggedInTreeItem, undefined));
    });
    it('Defaults:StudioOperations - Should display login item', async function () {
        //Setup
        StateManager.instance.globalState_userApiKey = "";

        //Get TreeView children
        const studioGraphTreeItems = await StateManager.instance.apolloStudioGraphsProvider.getChildren();

        //Assert
        studioGraphTreeItems.forEach(studioGraphTreeItem => assert.notStrictEqual(studioGraphTreeItem as NotLoggedInTreeItem, undefined));
    });
});