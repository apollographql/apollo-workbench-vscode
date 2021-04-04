import * as assert from 'assert';

import { activateExtension, cleanupWorkbenchFiles } from './helpers';
import { StateManager } from '../../workbench/stateManager';
import { NotLoggedInTreeItem } from '../../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider';
import { GettingStartedTopLevel } from '../../workbench/tree-data-providers/superGraphTreeDataProvider';

suite('Default Workbench Tests', () => {
    before(activateExtension);

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