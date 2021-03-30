import { StateManager } from "../workbench/stateManager";
import { extractEntityNames, extractEntitiesWithKeys } from "../graphql/parsers/schemaParser";
import { runOnlineParser } from "../graphql/parsers/runOnlineParser";
import { FieldWithType } from "../workbench/federationCompletionProvider";

export function generateTsConfig() {
    return JSON.stringify({
        "compilerOptions": {
            "module": "commonjs",
            "target": "ES2019",
            "lib": ["ES2019"],
            "outDir": "dist",
            "sourceMap": true,
            "strict": true,
            "rootDir": "src",
            "noImplicitAny": false,
            "esModuleInterop": true,
            "skipLibCheck": true
        },
        "exclude": ["node_modules"]
    })
}

export function generateCodeWorkspaceFile(serviceNames: string[]) {
    let codeWorkspaceFile = {
        folders: new Array(),
        launch: {
            configurations: new Array(),
            compounds: [
                {
                    name: "Launch All",
                    configurations: new Array()
                }
            ]
        },
        tasks: {
            version: "2.0.0",
            tasks: new Array()
        }
    }

    codeWorkspaceFile.tasks.tasks.push({
        label: "setup",
        dependsOn: ['setup gateway'],
        runOptions: { runOn: "folderOpen" }
    })
    codeWorkspaceFile.tasks.tasks.push({
        label: `setup gateway`,
        type: "shell",
        command: "npm i",
        options: { "cwd": `\${workspaceRoot:Gateway}` }
    });
    codeWorkspaceFile.folders.push({ name: `Gateway`, path: `gateway` });

    serviceNames.map(serviceName => {
        let codeServiceName = `Service - ${serviceName}`;
        codeWorkspaceFile.tasks.tasks[0].dependsOn.push(`setup ${serviceName}`);
        codeWorkspaceFile.tasks.tasks.push({
            label: `setup ${serviceName}`,
            type: "shell",
            command: "npm i",
            options: { "cwd": `\${workspaceRoot:${codeServiceName}}` }
        });

        codeWorkspaceFile.folders.push({ name: codeServiceName, path: `services/${serviceName}` });
        codeWorkspaceFile.launch.compounds[0].configurations.push(`Launch ${serviceName}`);
    })

    codeWorkspaceFile.launch.compounds[0].configurations.push(`Launch Gateway`);

    return JSON.stringify(codeWorkspaceFile);
}

let federatedServerPackageJson: any = {
    "scripts": {
        "local-schema-validation": "apollo service:check --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --localSchemaFile=src/schema.graphql",
        "local-schema-push-local": "apollo service:push --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --serviceURL=$(grep SERVICE_URL .env | cut -d '=' -f2) --localSchemaFile=src/schema.graphql",
        "start": "node src/index.js"
    },
    "main": "src/index.js",
    "dependencies": {
        "@apollo/federation": "latest",
        "apollo-datasource": "latest",
        "apollo-server": "latest"
    },
    "devDependencies": {
        "apollo": "latest"
    }
}

export function generateJsFederatedServerPackageJson(serviceName: string) {
    federatedServerPackageJson.name = serviceName;
    return JSON.stringify(federatedServerPackageJson);
}

export function generateTsFederatedServerPackageJson(serviceName: string) {
    let base = federatedServerPackageJson;
    base.name = serviceName;
    base.devDependencies = {
        "@types/node": "latest",
        "@types/node-fetch": "latest",
        "apollo": "latest",
        "typescript": "latest",
        "copyfiles": "2.3.0"
    }
    base.scripts = {
        "local-schema-validation": "apollo service:check --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --localSchemaFile=src/schema.graphql",
        "local-schema-push-local": "apollo service:push --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2) --serviceName=${serviceName} --serviceURL=$(grep SERVICE_URL .env | cut -d '=' -f2) --localSchemaFile=src/schema.graphql",
        "copy-schema": "copyfiles -u 1 src/schema.graphql dist",
        "postinstall": "npm run copy-schema && tsc --build tsconfig.json",
        "start": "node dist/index.js",
        "watch": "tsc --build tsconfig.json --watch"
    };

    return JSON.stringify(base);
}

let gatewayPackageJson: any = {
    "name": "graphql-gateway",
    "scripts": {
        "list-services": "apollo service:list --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2)",
        "start": "node src/index.js"
    },
    "main": "src/index.js",
    "dependencies": {
        "@apollo/gateway": "latest",
        "apollo-server": "latest"
    },
    "devDependencies": {
        "apollo": "latest",
        "dotenv": "latest"
    }
}

export function generateJsgatewayPackageJson() {
    return JSON.stringify(gatewayPackageJson);
}

export function generateTsgatewayPackageJson() {
    let base = gatewayPackageJson;
    base.devDependencies = {
        "@types/node": "latest",
        "@types/node-fetch": "latest",
        "apollo": "latest",
        "typescript": "latest",
        "dotenv": "latest"
    }
    base.scripts = {
        "list-services": "apollo service:list --variant=$(grep APOLLO_GRAPH_VARIANT .env | cut -d '=' -f2)",
        "postinstall": "tsc --build tsconfig.json",
        "start": "node dist/index.js",
        "watch": "tsc --build tsconfig.json --watch"
    };

    return JSON.stringify(base);
}

export function generateJsFederatedResolvers(schema: string) {
    let resolvers = 'module.exports = {\n';

    //1. Get all defined Entities 
    let entities = extractEntitiesWithKeys(schema);
    //2. For each Entity, create a default __resolveReference 
    //  AND create a resolver for all fields _without_ `@external`
    const resolver = (entity: string) => `   ${entity}: {
        __resolveReference(parent, args) {
            return { ...parent }
        }
    }`;
    // entities.forEach(entity => resolvers += resolver(entity));
    //3. Generate resolver for each field defined in Query and Mutation
    //4. (Optional) Support interface/unions






    resolvers += '\n}';

    return resolvers;
}

export function generateTsFederatedResolvers(schema: string) {
    let resolvers = 'export const resolvers = {\n';
    let entities = extractEntityNames(schema);
    entities.forEach(entity => resolvers += `\t${entity}: {\n\t\t__resolveReference(parent, args) {\n\t\t\treturn { ...parent }\n\t\t}\n\t}\n`);
    resolvers += '}';

    return resolvers;
}

export function generateJsFederatedServerTemplate(port: number, serviceName: string) {
    return `const { resolve } = require('path');
const { readFileSync } = require('fs');
const { gql, ApolloServer, addMockFunctionsToSchema } = require('apollo-server');
const { buildFederatedSchema } = require('@apollo/federation');

const mocks = require('./mocks.js');
const resolvers = require('./resolvers.js');
const typeDefs = gql(readFileSync(resolve(__dirname, "./schema.graphql"), { encoding: "utf8" }));
const schema = buildFederatedSchema({ typeDefs, resolvers });
addMockFunctionsToSchema({ schema, mocks, preserveResolvers: true });

const server = new ApolloServer({
    schema,
    subscriptions: false
});
    
const port = process.env.PORT || ${port};
server.listen({ port }).then(({ url }) => {
    console.log(\`🚀 ${serviceName} service ready at \${url}\`);
});`
}

export function generateTsFederatedServerTemplate(port: number, serviceName: string) {
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
    console.log(\`🚀 ${serviceName} service ready at \${url}\`);
});`
}

export function generateJsGatewayTempalte() {
    return `const { ApolloServer } = require('apollo-server');
const { ApolloGateway } = require('@apollo/gateway');

const isProd = process.env.NODE_ENV === "production";
if(!isProd)require('dotenv').config();

const gateway = new ApolloGateway({debug: !isProd});
const server = new ApolloServer({
    gateway,
    subscriptions: false
});
    
const port = process.env.PORT ||4000;
server.listen({ port }).then(({ url }) => {
    console.log(\`🚀 Gateway ready at \${url}\`);
});`
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
    console.log(\`🚀 Gateway ready at \${url}\`);
});`
}

export function generateJsVsCodeLaunch(serviceName: string) {
    return JSON.stringify({
        version: "0.2.0",
        configurations: [
            {
                type: "node",
                request: "launch",
                name: `Launch ${serviceName}`,
                program: "${workspaceFolder}/src/index.js"
            }
        ]
    });
}

export function generateTsVsCodeLaunch(serviceName: string) {
    return JSON.stringify({
        version: "0.2.0",
        configurations: [
            {
                type: "node",
                request: "launch",
                name: `Launch ${serviceName}`,
                program: "${workspaceFolder}/src/index.ts",
                outFiles: [
                    "${workspaceFolder}/dist/**/*.js"
                ],
                preLaunchTask: "tsc: build - tsconfig.json"
            }
        ]
    });
}