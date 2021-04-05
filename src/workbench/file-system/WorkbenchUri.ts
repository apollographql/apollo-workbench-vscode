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
                const subgraphPath = resolve(path, 'subgraphs', `${name}.graphql`);
                return Uri.parse(`workbench:${subgraphPath}?${name}`);
            case WorkbenchUriType.SCHEMAS_SETTINGS:
                const schemaSettingPath = resolve(path, 'subgraph-settings', `${name}-settings.json`);
                return Uri.parse(`workbench:${schemaSettingPath}?${name}`);
            case WorkbenchUriType.QUERIES:
                const queryPath = resolve(path, 'queries', `${name}.graphql`);
                return Uri.parse(`workbench:${queryPath}?${name}`);
            case WorkbenchUriType.QUERY_PLANS:
                const queryPlanPath = resolve(path, 'queryplans', `${name}.queryplan`);
                return Uri.parse(`workbench:${queryPlanPath}?${name}`);
            case WorkbenchUriType.SUPERGRAPH_SCHEMA:
                const superGraphSchemaPath = resolve(path, 'supergraph-schema', `${name}-supergraph.graphql`);
                return Uri.parse(`workbench:${superGraphSchemaPath}?${name}`);
            case WorkbenchUriType.SUPERGRAPH_API_SCHEMA:
                const superGraphApiSchemaPath = resolve(path, 'supergraph-api-schema', `${name}-api-schema.graphql`);
                return Uri.parse(`workbench:${superGraphApiSchemaPath}?${name}`);
            case WorkbenchUriType.MOCKS:
                return Uri.parse(resolve(StateManager.instance.extensionGlobalStoragePath ?? '', 'mocks', `${name}-mocks.js`));
        }
    }
}