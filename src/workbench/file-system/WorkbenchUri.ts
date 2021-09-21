import { Uri } from 'vscode';
import { normalize, resolve } from 'path';
import { StateManager } from '../stateManager';

export enum WorkbenchUriType {
  SCHEMAS,
  SCHEMAS_SETTINGS,
  QUERIES,
  QUERY_PLANS,
  MOCKS,
  SUPERGRAPH_SCHEMA,
  SUPERGRAPH_API_SCHEMA,
}

function platformPath(path: string) {
  if (path.toLowerCase().includes('c:'))
    path = path.slice(2).replace(/\\/g, '/');

  return path;
}

export class WorkbenchUri {
  static parse(wbFilePath: string) {
    return Uri.parse(`workbench:${platformPath(wbFilePath)}`);
  }
  static supergraph(
    path: string,
    name?: string,
    type: WorkbenchUriType = WorkbenchUriType.SUPERGRAPH_SCHEMA,
  ): Uri {
    switch (type) {
      case WorkbenchUriType.SCHEMAS: {
        let subgraphPath = resolve(path, 'subgraphs', `${name}.graphql`);
        return Uri.parse(`workbench:${platformPath(subgraphPath)}?${name}`);
      }
      case WorkbenchUriType.SCHEMAS_SETTINGS: {
        let schemaSettingPath = resolve(
          path,
          'subgraph-settings',
          `${name}-settings.json`,
        );
        return Uri.parse(`workbench:${platformPath(schemaSettingPath)}?${name}`);
      }
      case WorkbenchUriType.QUERIES: {
        let queryPath = resolve(path, 'queries', `${name}.graphql`);
        return Uri.parse(`workbench:${platformPath(queryPath)}?${name}`);
      }
      case WorkbenchUriType.QUERY_PLANS: {
        let queryPlanPath = resolve(path, 'queryplans', `${name}.queryplan`);
        return Uri.parse(`workbench:${platformPath(queryPlanPath)}?${name}`);
      }
      case WorkbenchUriType.SUPERGRAPH_SCHEMA: {
        let superGraphSchemaPath = resolve(
          path,
          'supergraph-schema',
          `${name}-supergraph.graphql`,
        );
        return Uri.parse(`workbench:${platformPath(superGraphSchemaPath)}?${name}`);
      }
      case WorkbenchUriType.SUPERGRAPH_API_SCHEMA: {
        let superGraphApiSchemaPath = resolve(
          path,
          'supergraph-api-schema',
          `${name}-api-schema.graphql`,
        );
        return Uri.parse(`workbench:${platformPath(superGraphApiSchemaPath)}?${name}`);
      }
      case WorkbenchUriType.MOCKS: {
        let subgarphMocksPath = resolve(
          StateManager.instance.extensionGlobalStoragePath ?? '',
          'mocks',
          `${name}-mocks.js`,
        );

        return Uri.parse(`${normalize(subgarphMocksPath)}?${path}:${name}`);
      }
    }
  }
}
