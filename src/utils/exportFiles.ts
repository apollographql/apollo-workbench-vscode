import { StateManager } from '../workbench/stateManager';
import { extractEntityNames } from '../graphql/parsers/schemaParser';
import {
  ApolloWorkbenchFile,
  WorkbenchSchema,
} from '../workbench/file-system/fileTypes';

export function generateTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      module: 'commonjs',
      target: 'ES2019',
      lib: ['ES2019'],
      outDir: 'dist',
      sourceMap: true,
      strict: true,
      rootDir: 'src',
      noImplicitAny: false,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    exclude: ['node_modules'],
  });
}

export function generateCodeWorkspaceFile(subgraphNames: string[]) {
  const codeWorkspaceFile = {
    folders: [] as any[],
    launch: {
      configurations: [] as any[],
      compounds: [
        {
          name: 'Launch All',
          configurations: [] as any[],
        },
      ],
    },
    tasks: {
      version: '2.0.0',
      tasks: [] as any[],
    },
  };

  codeWorkspaceFile.tasks.tasks.push({
    label: 'setup',
    dependsOn: ['setup gateway'],
    runOptions: { runOn: 'folderOpen' },
  });
  codeWorkspaceFile.tasks.tasks.push({
    label: `setup gateway`,
    type: 'shell',
    command: 'npm i',
    options: { cwd: `\${workspaceRoot:Graph Router}` },
  });
  codeWorkspaceFile.folders.push({
    name: `Graph Router`,
    path: `graph-router`,
  });

  subgraphNames.map((subgraphName) => {
    const codeSubgraphName = `Subgraph - ${subgraphName}`;
    codeWorkspaceFile.tasks.tasks[0].dependsOn.push(`setup ${subgraphName}`);
    codeWorkspaceFile.tasks.tasks.push({
      label: `setup ${subgraphName}`,
      type: 'shell',
      command: 'npm i',
      options: { cwd: `\${workspaceRoot:${codeSubgraphName}}` },
    });

    codeWorkspaceFile.folders.push({
      name: codeSubgraphName,
      path: `subgraphs/${subgraphName}`,
    });
    codeWorkspaceFile.launch.compounds[0].configurations.push(
      `Launch ${subgraphName}`,
    );
  });

  codeWorkspaceFile.launch.compounds[0].configurations.push(`Launch Gateway`);

  return JSON.stringify(codeWorkspaceFile);
}

export function generateSubgraphAction() {
  return `
name: Publish Schema to Apollo Studio

on:
  push: 
    branches: [main]

  # Allows you to run this workflow manually from the Actions tab
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    environment: apollo
    env:
      APOLLO_VCS_COMMIT: \${{ github.event.pull_request.head.sha }}
      APOLLO_KEY: \${{ secrets.APOLLO_KEY }}
      APOLLO_GRAPH_VARIANT: production
    steps: 
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with: 
          node-version: '14'
          check-latest: true
      - run: curl -sSL https://rover.apollo.dev/nix/latest | sh
      - run: echo "$HOME/.rover/bin" >> $GITHUB_PATH
      - run: npm run publish-schema`;
}

const federatedServerPackageJson: any = {
  scripts: {
    start: 'node src/index.js',
  },
  main: 'src/index.js',
  dependencies: {
    '@apollo/federation': 'latest',
    'apollo-datasource': 'latest',
    'apollo-server': 'latest',
    'graphql-tools': 'latest',
    faker: 'latest',
  },
  devDependencies: {
    '@apollo/rover': 'latest',
    dotenv: 'latest',
  },
};

export function generateJsFederatedServerPackageJson(
  serviceName: string,
  port: number = 4001,
  graphRef: string = 'GRAPH_REF_NAME',
) {
  federatedServerPackageJson.name = serviceName;
  federatedServerPackageJson.scripts[
    'publish-schema'
  ] = `rover subgraph publish ${graphRef}@\${APOLLO_GRAPH_VARIANT} --name=${serviceName} --schema=schema.graphql --routing-url=http://localhost:${port} --convert`;
  return JSON.stringify(federatedServerPackageJson);
}

export function generateTsFederatedServerPackageJson(serviceName: string) {
  const base = federatedServerPackageJson;
  base.name = serviceName;
  base.devDependencies = {
    '@types/node': 'latest',
    '@types/node-fetch': 'latest',
    apollo: 'latest',
    typescript: 'latest',
    copyfiles: '2.3.0',
  };
  base.scripts = {
    'local-schema-validation':
      "apollo service:check --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --localSchemaFile=src/schema.graphql",
    'local-schema-push-local':
      "apollo service:push --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --serviceURL=$(grep SERVICE_URL .env | cut -d '=' -f2) --localSchemaFile=src/schema.graphql",
    'copy-schema': 'copyfiles -u 1 src/schema.graphql dist',
    postinstall: 'npm run copy-schema && tsc --build tsconfig.json',
    start: 'node dist/index.js',
    watch: 'tsc --build tsconfig.json --watch',
  };

  return JSON.stringify(base);
}

const gatewayPackageJson: any = {
  name: 'graphql-gateway',
  scripts: {
    compose:
      'rover supergraph compose --config supergraph.yaml  > supergraph-schema.graphql',
    start: 'node src/index.js',
    postinstall: 'npm run compose',
  },
  main: 'src/index.js',
  dependencies: {
    '@apollo/gateway': 'latest',
    'apollo-server': 'latest',
  },
  devDependencies: {
    '@apollo/rover': 'latest',
    dotenv: 'latest',
  },
};

export function generateJsgatewayPackageJson() {
  return JSON.stringify(gatewayPackageJson);
}

export function generateTsgatewayPackageJson() {
  const base = gatewayPackageJson;
  base.devDependencies = {
    '@types/node': 'latest',
    '@types/node-fetch': 'latest',
    apollo: 'latest',
    typescript: 'latest',
    dotenv: 'latest',
  };
  base.scripts = {
    'list-services':
      "apollo service:list --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2)",
    postinstall: 'tsc --build tsconfig.json',
    start: 'node dist/index.js',
    watch: 'tsc --build tsconfig.json --watch',
  };

  return JSON.stringify(base);
}

export function generateJsFederatedResolvers(schema: string) {
  let resolvers = `// Documentation on resolving entities:
//  https://www.apollographql.com/docs/federation/entities/#resolving
const resolvers = {
`;
  const entities = extractEntityNames(schema);
  entities.forEach(
    (entity) =>
      (resolvers += `\t${entity}: {\n\t\t__resolveReference(parent, args) {\n\t\t\treturn { ...parent }\n\t\t}\n\t},\n`),
  );
  resolvers += '}\nmodule.exports = resolvers;';

  return resolvers;
}

export function generateJsFederatedMocks(subgraph: WorkbenchSchema) {
  let customMocks = subgraph.customMocks;
  if (subgraph.shouldMock && customMocks) {
    //By default we add the export shown to the user, but they may delete it
    if (!customMocks.includes('module.exports'))
      customMocks = customMocks.concat('\nmodule.exports = mocks');

    return customMocks;
  }
  return `const mocks = {}\n\nmodule.exports = mocks;`;
}

export function generateJsFederatedServerTemplate(
  port: number,
  serviceName: string,
) {
  return `const { resolve } = require('path');
const { readFileSync } = require('fs');
const { gql, ApolloServer } = require('apollo-server');
const { buildFederatedSchema } = require('@apollo/federation');
const { addMocksToSchema } = require('@graphql-tools/mock');

const mocks = require('./mocks.js');
const resolvers = require('./resolvers.js');
const typeDefs = gql(readFileSync(resolve(__dirname, "..","schema.graphql"), { encoding: "utf8" }));
const federatedSchema = buildFederatedSchema({ typeDefs, resolvers });
const schema = addMocksToSchema({
  schema: federatedSchema,
  mocks,
  preserveResolvers: true,
});

const server = new ApolloServer({ schema });
    
const port = process.env.PORT || ${port};
server.listen({ port }).then(({ url }) => {
    console.log(\`🚀 Subgraph ${serviceName} ready at \${url}\`);
});`;
}

export function generateTsFederatedServerTemplate(
  port: number,
  serviceName: string,
) {
  return `import { resolve } from 'path';
import { readFileSync } from 'fs';
import { gql, ApolloServer } from 'apollo-server';
import { buildFederatedSchema } from '@apollo/federation';

const typeDefs = gql(readFileSync(resolve(__dirname, "./schema.graphql"), { encoding: "utf8" }));
const server = new ApolloServer({
    schema: buildFederatedSchema([{ typeDefs }]),
    mocks: true,
    mockEntireSchema: false,
    engine: false,
    });
    
const port = process.env.PORT || ${port};
server.listen({ port }).then(({ url }) => {
    log(\`🚀 ${serviceName} service ready at \${url}\`);
});`;
}

export function generateJsGatewayTempalte() {
  return `require('dotenv').config();
const { resolve } = require('path');
const { readFileSync } = require('fs');
const { ApolloServer } = require('apollo-server');
const { ApolloGateway } = require('@apollo/gateway');

let gateway;
if(process.env.APOLLO_KEY && process.env.APOLLO_GRAPH_REF) {
  //Default to Apollo Managed Federation
  gateway = new ApolloGateway();
} else {
  const supergraphSdl = readFileSync(resolve(__dirname, '..', 'supergraph-schema.graphql'), { encoding: "utf8" });
  gateway = new ApolloGateway({ supergraphSdl });
}
const server = new ApolloServer({
    gateway,
    subscriptions: false
});
    
const port = process.env.PORT ||4000;
server.listen({ port }).then(({ url }) => {
    console.log(\`🚀 Graph Router ready at \${url}\`);
});`;
}

export function generateTsGatewayTempalte() {
  return `import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';

const isProd = process.env.NODE_ENV === "production";
if(!isProd)require('dotenv').config();

const gateway = new ApolloGateway({debug: !isProd});
const server = new ApolloServer({
    gateway,
    subscriptions: false
});
    
const port = process.env.PORT || ${StateManager.settings_gatewayServerPort};
server.listen({ port }).then(({ url }) => {
    log(\`🚀 Gateway ready at \${url}\`);
});`;
}

export function generateJsVsCodeLaunch(serviceName: string) {
  return JSON.stringify({
    version: '0.2.0',
    configurations: [
      {
        type: 'node',
        request: 'launch',
        name: `Launch ${serviceName}`,
        program: '${workspaceFolder}/src/index.js',
      },
    ],
  });
}

export function generateTsVsCodeLaunch(serviceName: string) {
  return JSON.stringify({
    version: '0.2.0',
    configurations: [
      {
        type: 'node',
        request: 'launch',
        name: `Launch ${serviceName}`,
        program: '${workspaceFolder}/src/index.ts',
        outFiles: ['${workspaceFolder}/dist/**/*.js'],
        preLaunchTask: 'tsc: build - tsconfig.json',
      },
    ],
  });
}
