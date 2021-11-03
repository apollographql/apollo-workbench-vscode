import { resolve } from 'path';
import { BaseEncodingOptions, mkdirSync, writeFileSync } from 'fs';
import { StateManager } from '../workbench/stateManager';
import {
  generateTsVsCodeLaunch,
  generateTsConfig,
  generateTsgatewayPackageJson,
  generateTsGatewayTempalte,
  generateTsFederatedServerPackageJson,
  generateTsFederatedServerTemplate,
  generateCodeWorkspaceFile,
  generateSubgraphAction,
  generateJsFederatedResolvers,
  generateJsFederatedMocks,
  generateTsFederatedResolvers,
} from './exportFiles';
import { ApolloWorkbenchFile } from '../workbench/file-system/fileTypes';

export function createTypescriptTemplate(
  workbenchFile: ApolloWorkbenchFile,
  graphName: string,
  apiKey?: string,
) {
  const options: BaseEncodingOptions = { encoding: 'utf-8' };
  const fileName = workbenchFile.graphName.replace(/[/|\\:*?"<>]/g, ' ');
  const destPath = resolve(
    StateManager.workspaceRoot ?? __dirname,
    `${fileName}-ts`,
  );

  //Create root folder
  mkdirSync(destPath, { recursive: true });

  //Create Gateway Assets
  const graphRouterFolder = resolve(destPath, 'graph-router');
  const graphRouterSrcFolder = resolve(graphRouterFolder, 'src');
  const vscodeFolder = resolve(graphRouterFolder, '.vscode');
  mkdirSync(graphRouterSrcFolder, { recursive: true });
  mkdirSync(vscodeFolder, { recursive: true });
  writeFileSync(
    resolve(vscodeFolder, 'launch.json'),
    generateTsVsCodeLaunch('Gateway'),
    options,
  );
  writeFileSync(
    resolve(graphRouterFolder, 'package.json'),
    generateTsgatewayPackageJson(workbenchFile.federation),
    options,
  );
  writeFileSync(
    resolve(graphRouterFolder, 'tsconfig.json'),
    generateTsConfig(),
    options,
  );
  writeFileSync(
    resolve(graphRouterFolder, '.env'),
    `APOLLO_KEY=${
      apiKey ?? ''
    }\nAPOLLO_GRAPH_REF=${graphName}@workbench\nPORT=${
      StateManager.settings_gatewayServerPort
    }`,
    options,
  );
  writeFileSync(
    resolve(graphRouterSrcFolder, 'index.ts'),
    generateTsGatewayTempalte(),
    options,
  );

  //Create Subgraph Assets
  //This is where we would want to change between monolith or subgraphs folder
  const subgraphsFolder = resolve(destPath, 'subgraphs');
  mkdirSync(subgraphsFolder, { recursive: true });

  let roverString = `# Learn more about using the @apollo/rover CLI to work with supergraphs:
#  https://www.apollographql.com/docs/rover/supergraphs/
subgraphs:
`;

  let port = StateManager.settings_startingServerPort;
  for (const subgraphName in workbenchFile.schemas) {
    const subgraphFolder = resolve(subgraphsFolder, subgraphName);
    const subgraphVsCodeFolder = resolve(subgraphFolder, '.vscode');
    const githubActionsFolder = resolve(subgraphFolder, '.github', 'workflows');
    const subgraphSrcFolder = resolve(subgraphFolder, 'src');
    const subgraphSchema = workbenchFile.schemas[subgraphName].sdl;
    const schemaPath = resolve(subgraphFolder, 'schema.graphql');

    let subgraphUrl = workbenchFile.schemas[subgraphName].url;
    if (!subgraphUrl || subgraphUrl == '')
      subgraphUrl = `http://localhost:${port}`;

    roverString += `  ${subgraphName}:\n`;
    roverString += `    routing_url: ${subgraphUrl}\n`;
    roverString += `    schema:\n`;
    roverString += `      file: ${schemaPath}\n`;

    mkdirSync(subgraphVsCodeFolder, { recursive: true });
    mkdirSync(subgraphSrcFolder, { recursive: true });
    mkdirSync(githubActionsFolder, { recursive: true });

    writeFileSync(
      resolve(subgraphFolder, 'package.json'),
      generateTsFederatedServerPackageJson(subgraphName),
      options,
    );
    writeFileSync(
      resolve(subgraphFolder, 'tsconfig.json'),
      generateTsConfig(),
      options,
    );
    writeFileSync(schemaPath, subgraphSchema, options);
    writeFileSync(
      resolve(subgraphSrcFolder, 'index.ts'),
      generateTsFederatedServerTemplate(port, subgraphName),
      options,
    );
    writeFileSync(
      resolve(subgraphSrcFolder, 'resolvers.ts'),
      generateTsFederatedResolvers(subgraphSchema),
      options,
    );
    writeFileSync(
      resolve(subgraphSrcFolder, 'mocks.ts'),
      generateJsFederatedMocks(workbenchFile.schemas[subgraphName]),
      options,
    );
    generateJsFederatedResolvers;
    writeFileSync(
      resolve(subgraphVsCodeFolder, 'launch.json'),
      generateTsVsCodeLaunch(subgraphName),
      options,
    );
    writeFileSync(
      resolve(githubActionsFolder, 'publish-schema.yaml'),
      generateSubgraphAction(graphName, port),
      options,
    );

    port++;
  }

  writeFileSync(
    resolve(destPath, 'gateway.code-workspace'),
    generateCodeWorkspaceFile(Object.keys(workbenchFile.schemas)),
    options,
  );
  writeFileSync(
    resolve(graphRouterFolder, 'supergraph.yaml'),
    roverString,
    options,
  );

  return destPath;
}
