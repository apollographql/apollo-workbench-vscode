import * as assert from 'assert';
import { suite, it } from 'mocha'
import { activateExtension, cleanupWorkbenchFiles, createAndLoadEmptyWorkbenchFile } from './helpers';
import { FileProvider, WorkbenchUri, WorkbenchUriType } from '../../utils/files/fileProvider';
import { StateManager } from '../../workbench/stateManager';
import { WorkbenchSchemaTreeItem } from '../../workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider';
import { WorkbenchOperationTreeItem } from '../../workbench/current-workbench-queries/currentWorkbenchOpsTreeDataProvider';

const key = 'Loaded-Folder';

suite(key, () => {
    before(activateExtension);
    beforeEach(createAndLoadEmptyWorkbenchFile);
    afterEach(cleanupWorkbenchFiles);

    it(`${key}:LocalWorkbenchFiles - New blank workbench is displayed correctly`, async function () {
        //Get children elements from TreeView data providers
        const currentWorkbenchSchemas = await StateManager.instance.currentWorkbenchSchemasProvider.getChildren();
        const currentWorkbenchOperations = await StateManager.instance.currentWorkbenchOperationsProvider.getChildren();

        //Ensure children elements are blank workbench defaults
        assert.strictEqual(currentWorkbenchSchemas.length, 1);
        assert.strictEqual(currentWorkbenchOperations.length, 1);
        assert.strictEqual(currentWorkbenchSchemas[0].label, 'No schemas in selected workbench file');
        assert.strictEqual(currentWorkbenchOperations[0].label, 'No operations in selected workbench file');
    });
    it(`${key}:LocalWorkbenchFiles - Add schema to blank workbench`, async function () {
        //Add schema/service to loaded workbench
        const serviceName = 'fist-service';
        await FileProvider.instance.addSchema(serviceName);

        //Get children elements from TreeView data providers
        const currentWorkbenchSchemas = await StateManager.instance.currentWorkbenchSchemasProvider.getChildren();
        const schemaContent = await FileProvider.instance.readFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS)).toString();

        //Ensure children elements are properly displayed
        assert.strictEqual(schemaContent, '');
        assert.strictEqual(currentWorkbenchSchemas.length, 1);
        assert.strictEqual(currentWorkbenchSchemas[0].label, serviceName);
        assert.strictEqual((currentWorkbenchSchemas[0] as WorkbenchSchemaTreeItem).serviceName, serviceName);
    });
    it(`${key}:LocalWorkbenchFiles - Add operation to blank workbench`, async function () {
        //Add operation to loaded workbench
        const operationName = 'Test';
        await FileProvider.instance.addOperation(operationName);

        //Get children elements from TreeView data providers
        const currentWorkbenchOperations = await StateManager.instance.currentWorkbenchOperationsProvider.getChildren();
        const operationContent = await FileProvider.instance.readFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERIES)).toString();

        //Ensure children elements are properly displayed
        assert.strictEqual(currentWorkbenchOperations.length, 1);
        assert.strictEqual(currentWorkbenchOperations[0].label, operationName);
        assert.strictEqual((currentWorkbenchOperations[0] as WorkbenchOperationTreeItem).operationName, operationName);
        assert.strictEqual(operationContent, `query ${operationName} {\n\t\n}`);
    });
})