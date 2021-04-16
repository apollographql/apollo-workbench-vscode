import { Uri } from "vscode";
import { resolve } from "path";
import { StateManager } from "../stateManager";
import { FileProvider } from "./fileProvider";

export enum WorkbenchUriType {
    SCHEMAS,
    SCHEMAS_SETTINGS,
    QUERIES,
    QUERY_PLANS,
    MOCKS,
    SUPERGRAPH_SCHEMA,
    SUPERGRAPH_API_SCHEMA
}
export class WorkbenchUri {
    static supergraph(path: string, name?: string, type: WorkbenchUriType = WorkbenchUriType.SUPERGRAPH_SCHEMA): Uri {
        switch (type) {
            case WorkbenchUriType.SCHEMAS:
                let subgraphPath = resolve(path, 'subgraphs', `${name}.graphql`);
                if (subgraphPath.includes('C:')) subgraphPath = subgraphPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${subgraphPath}?${name}`);
            case WorkbenchUriType.SCHEMAS_SETTINGS:
                let schemaSettingPath = resolve(path, 'subgraph-settings', `${name}-settings.json`);
                if (schemaSettingPath.includes('C:')) schemaSettingPath = schemaSettingPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${schemaSettingPath}?${name}`);
            case WorkbenchUriType.QUERIES:
                let queryPath = resolve(path, 'queries', `${name}.graphql`);
                if (queryPath.includes('C:')) queryPath = queryPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${queryPath}?${name}`);
            case WorkbenchUriType.QUERY_PLANS:
                let queryPlanPath = resolve(path, 'queryplans', `${name}.queryplan`);
                if (queryPlanPath.includes('C:')) queryPlanPath = queryPlanPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${queryPlanPath}?${name}`);
            case WorkbenchUriType.SUPERGRAPH_SCHEMA:
                let superGraphSchemaPath = resolve(path, 'supergraph-schema', `${name}-supergraph.graphql`);
                if (superGraphSchemaPath.includes('C:')) superGraphSchemaPath = superGraphSchemaPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${superGraphSchemaPath}?${name}`);
            case WorkbenchUriType.SUPERGRAPH_API_SCHEMA:
                let superGraphApiSchemaPath = resolve(path, 'supergraph-api-schema', `${name}-api-schema.graphql`);
                if (superGraphApiSchemaPath.includes('C:')) superGraphApiSchemaPath = superGraphApiSchemaPath.slice(2).replace(/\\/g, '/');
                return Uri.parse(`workbench:${superGraphApiSchemaPath}?${name}`);
            case WorkbenchUriType.MOCKS:
                let subgarphMocksPath = resolve(StateManager.instance.extensionGlobalStoragePath ?? '', 'mocks', `${name}-mocks.js`);
                if (subgarphMocksPath.toLowerCase().includes('c:')) subgarphMocksPath = subgarphMocksPath.slice(2).replace(/\\/g, '/');

                return Uri.parse(`${subgarphMocksPath}?${path}:${name}`);
        }
    }
}