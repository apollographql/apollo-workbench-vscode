import * as assert from 'assert';
import { suite, it } from 'mocha'
import { activateExtension, cleanupWorkbenchFiles, createAndLoadEmptyWorkbenchFile, simpleSchema } from './helpers';
import { FileProvider } from '../../workbench/file-system/fileProvider';
import { StateManager } from '../../workbench/stateManager';
import { WorkbenchSchemaTreeItem } from '../../workbench/tree-data-providers/currentWorkbenchSchemasTreeDataProvider';
import { WorkbenchOperationTreeItem } from '../../workbench/tree-data-providers/currentWorkbenchOpsTreeDataProvider';
import { WorkbenchUri, WorkbenchUriType } from '../../workbench/file-system/WorkbenchUri';

const key = 'Loaded-Folder';

suite(key, () => {
    before(activateExtension);
    afterEach(cleanupWorkbenchFiles);

    it(`${key}:LocalWorkbenchFiles - New blank workbench is displayed correctly`, async function () {
        await createAndLoadEmptyWorkbenchFile();
        //Get children elements from TreeView data providers
        const currentWorkbenchSchemas = await StateManager.instance.currentWorkbenchSchemasProvider.getChildren();
        const currentWorkbenchOperations = await StateManager.instance.currentWorkbenchOperationsProvider.getChildren();

        //Ensure children elements are blank workbench defaults
        assert.strictEqual(currentWorkbenchSchemas.length, 1);
        assert.strictEqual(currentWorkbenchOperations.length, 1);
        assert.strictEqual(currentWorkbenchSchemas[0].label, 'No schemas in selected workbench file');
        assert.strictEqual(currentWorkbenchOperations[0].label, 'No operations in selected workbench file');
    });
    it(`${key}:LoadedWorkbench:Schemas - Add schema to blank workbench`, async function () {
        await createAndLoadEmptyWorkbenchFile();
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
    it(`${key}:LoadedWorkbench:Operations - Add operation to blank workbench`, async function () {
        await createAndLoadEmptyWorkbenchFile();
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
    it(`${key}:CSDL - Ensure CSDL is generated on writeFile for valid schemas`, async function () {
        await createAndLoadEmptyWorkbenchFile();

        //Add schema/service to loaded workbench
        const serviceName = 'fist-service';
        await FileProvider.instance.addSchema(serviceName);
        await FileProvider.instance.writeFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS), Buffer.from(simpleSchema), { create: true, overwrite: true });

        //Get CSDL
        const csdl = await FileProvider.instance.readFile(WorkbenchUri.csdl()).toString();


        //Ensure not empty and starts with `schema`
        assert.notStrictEqual(csdl, '');
        assert.strictEqual(csdl.substring(0, 6), 'schema');
    });
    it(`${key}:CSDL - Ensure no CSDL is generated for invalid schema`, async function () {
        await createAndLoadEmptyWorkbenchFile();

        //Add schema/service to loaded workbench
        const serviceName = 'fist-service';
        await FileProvider.instance.addSchema(serviceName);
        await FileProvider.instance.writeFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS), Buffer.from('type invalid { schema }'), { create: true, overwrite: true });

        //Get CSDL
        const csdl = await FileProvider.instance.readFile(WorkbenchUri.csdl()).toString();

        //Ensure csdl is not generated
        assert.strictEqual(csdl, '');
    });
    it(`${key}:QueryPlan - Ensure query plan is generated with valid csdl`, async function () {
        await createAndLoadEmptyWorkbenchFile();

        //Add schema/service to loaded workbench
        const serviceName = 'fist-service';
        await FileProvider.instance.addSchema(serviceName);
        await FileProvider.instance.writeFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS), Buffer.from(simpleSchema), { create: true, overwrite: true });

        //Add valid operation to loaded workbench
        const operationName = 'Test';
        await FileProvider.instance.addOperation(operationName);
        await FileProvider.instance.writeFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERIES), Buffer.from('query Test { a { id } }'), { create: true, overwrite: true })

        //Get query plan
        const queryPlan = FileProvider.instance.readFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERY_PLANS)).toString();

        //Ensure csdl is not generated
        assert.notStrictEqual(queryPlan, 'Either there is no valid composed schema or the query is not valid\nUnable to generate query plan');
        assert.strictEqual(queryPlan.substring(0, 9), 'QueryPlan');
    });
    it(`${key}:QueryPlan - Ensure no query plan is generated with no csdl`, async function () {
        await createAndLoadEmptyWorkbenchFile();

        //Add blank schema/service to loaded workbench
        const serviceName = 'fist-service';
        await FileProvider.instance.addSchema(serviceName);

        //Add valid operation to loaded workbench
        const operationName = 'Test';
        await FileProvider.instance.addOperation(operationName);
        await FileProvider.instance.writeFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERIES), Buffer.from('query Test { a { id } }'), { create: true, overwrite: true })

        //Get query plan
        const queryPlan = FileProvider.instance.readFile(WorkbenchUri.parse(operationName, WorkbenchUriType.QUERY_PLANS)).toString();

        //Ensure csdl is not generated
        assert.strictEqual(queryPlan, 'Either there is no valid composed schema or the query is not valid\nUnable to generate query plan');
    });
})