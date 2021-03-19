import { Uri } from "vscode";
import { resolve } from "path";
import { StateManager } from "../stateManager";
import { FileProvider } from "./fileProvider";

export enum WorkbenchUriType {
    SCHEMAS,
    SCHEMAS_SETTINGS,
    QUERIES,
    QUERY_PLANS,
    MOCKS
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
            case WorkbenchUriType.MOCKS:
                return Uri.parse(resolve(StateManager.instance.extensionGlobalStoragePath ?? '', 'mocks', `${name}-mocks.js`));
        }
    }
}