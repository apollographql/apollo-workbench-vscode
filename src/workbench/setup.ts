import { writePortMapping, workspaceSchemasFolder, getWorkbenchFile, saveWorkbenchFile, getPortMapping, getSelectedWorkbenchFile, saveSelectedWorkbenchFile, getLocalSchemaFromFile } from "../helpers";
import * as vscode from 'vscode';
import { resolve } from "path";
import { gql, ApolloServer } from "apollo-server";
import { writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { buildFederatedSchema, composeAndValidate } from '@apollo/federation';
import { ApolloWorkbench, outputChannel } from "../extension";

import { OverrideApolloGateway } from '../gateway';

let isReady = false;
let serversState: any = {};
let takenPorts: any = [];

export const setupMocks = (context: vscode.ExtensionContext) => {
    outputChannel.append('Syncing GraphQL fiels in queries folder to workbench file...')
    let workbenchFile = syncGraphQLFilesToWorkbenchFile(context);
    console.log('Sync complete');

    let port = 4001;
    while (serversState[port])
        port++;
    let portMapping = {};

    for (var key in workbenchFile.schemas) {
        let serviceName = key;
        let workbenchSchemaString = workbenchFile.schemas[key];

        console.log(`Attemping to start server: ${serviceName}`);
        startServer(serviceName, port, workbenchSchemaString);
        console.log(`Running at port ${port}`);

        portMapping[serviceName] = port;
        takenPorts.push(port);
        port++;
    }

    console.log(`Writing port mappings: ${JSON.stringify(portMapping)}`);
    writePortMapping(portMapping);
    startGateway();
    logCompositionErrors(workbenchFile);
}

export function stopMocks() {
    if (serversState?.gateway)
        serversState.gateway.experimental_pollInterval = 10000000;

    for (var key in serversState) {
        if (key != 'gateway') {
            outputChannel.append(`Stopping server running at port ${key}...`);
            isReady = false;
            serversState[key].stop();
            delete serversState[key];
            outputChannel.appendLine(`complete.`);
        }
    }

    takenPorts = [];
    writePortMapping({});
}

function startGateway() {
    if (serversState[4000]) {
        outputChannel.append(`Stopping previous running gateway...`);
        isReady = false;
        serversState[4000].stop();
        delete serversState[4000];
        console.log(`complete.`);
    }

    console.log(`Starting gateway`);

    if (!serversState['gateway']) serversState['gateway'] = new OverrideApolloGateway({ debug: true });
    else serversState['gateway'].experimental_pollInterval = 10000
    const server = new ApolloServer({
        gateway: serversState['gateway'],
        subscriptions: false,
        engine: {
            apiKey: process.env.APOLLO_KEY || ""
        }
    });

    const port = process.env.PORT || 4000;
    server.listen({ port }).then(({ url }) => {
        console.log(`🚀 Mocked Gateway ready at ${url}`);
    });

    serversState[4000] = server;
    isReady = true;
}

function startServer(serviceName, port, schemaString) {
    if (serversState[port]) {
        console.log(`Stoppiing previous running server at port: ${port}`);
        serversState[port].stop();
        delete serversState[port];
    }

    try {
        const typeDefs = gql(schemaString);
        const server = new ApolloServer({
            schema: buildFederatedSchema(typeDefs),
            mocks: true,
            mockEntireSchema: false,
            engine: false,
        });
        server.listen({ port }).then(({ url }) => console.log(`🚀 ${serviceName} mocked server ready at ${url}`));
        serversState[port] = server;
    } catch (err) {
        if (err.message.includes('EOF')) {
            console.log(`${serviceName} has no contents, try defining a schema`);
        } else {
            console.log(`${serviceName} has composition errors - ${err}`);
        }
    }
}

export function addSchema(path: string, context: vscode.ExtensionContext) {
    if (!path || !path.includes('.graphql') || path == '.graphql') return;

    let selectedWbFile = context.workspaceState.get('selectedWbFile');
    let workbenchFile = getWorkbenchFile((selectedWbFile as any)?.path);

    let portMapping = getPortMapping();
    let path1 = path.split('.graphql')[0];
    let path2 = path1.split('/');
    let serviceName = path2[path2.length - 1];

    console.log(`Setting up ${serviceName}`);

    let localSchemaString = getLocalSchemaFromFile(serviceName);
    workbenchFile.schemas[serviceName] = localSchemaString;

    if (localSchemaString != workbenchFile.schemas[serviceName]) {
        console.log(`Setting up ${serviceName}...`);

        let port = portMapping[serviceName] || 4000;
        if (port == 4000) {
            while (serversState[port])
                port++;

            portMapping[serviceName] = port;
        }

        console.log(`  on port ${port}`);

        startServer(serviceName, port, localSchemaString);
        workbenchFile.schemas[serviceName] = localSchemaString;

        writePortMapping(portMapping);
        saveWorkbenchFile(workbenchFile, (selectedWbFile as any)?.path);
        logCompositionErrors(workbenchFile);
    }
}

export function updateSchema(path: string, context: vscode.ExtensionContext) {
    if (!path || !path.includes('.graphql') || path == '.graphql') return;

    let selectedWbFile = context.workspaceState.get('selectedWbFile');
    let workbenchFile = getWorkbenchFile((selectedWbFile as any)?.path);

    let port = 0;
    let portMapping = getPortMapping();
    let path1 = path.split('.graphql')[0];
    let path2 = path1.split('/');
    let serviceName = path2[path2.length - 1];

    console.log(`Setting up ${serviceName}`);

    let localSchemaString = getLocalSchemaFromFile(serviceName);
    workbenchFile.schemas[serviceName] = localSchemaString;

    for (var key in portMapping) {
        if (key == serviceName) {
            port = portMapping[key];
        }
    }

    if (port > 0) {
        startServer(serviceName, port, localSchemaString);
        startGateway();
    }

    writePortMapping(portMapping);
    saveWorkbenchFile(workbenchFile, (selectedWbFile as any)?.path);
    logCompositionErrors(workbenchFile);
}

export function deleteSchema(path: string, context: vscode.ExtensionContext) {
    if (!isReady || !path || !path.includes('.graphql')) return;

    let portMapping = getPortMapping();
    let workbenchFile = getSelectedWorkbenchFile(context);
    let path1 = path.split('.graphql')[0];
    let path2 = path1.split('/');
    let serviceName = path2[path2.length - 1];

    let port = portMapping[serviceName];
    process.stdout.write(`Deleting ${serviceName} on port ${port}`);

    serversState[port].stop();
    delete serversState[port];
    delete portMapping[serviceName];
    delete workbenchFile.schemas[serviceName];

    writePortMapping(portMapping);
    saveSelectedWorkbenchFile(workbenchFile, context);
    startGateway();
}

function logCompositionErrors(workbenchFile: ApolloWorkbench) {
    let sdls: any = [];

    try {
        for (var key in workbenchFile.schemas) {
            let localSchemaString = getLocalSchemaFromFile(key);
            sdls.push({ name: key, typeDefs: gql(localSchemaString) });
        }

        const { schema, errors, composedSdl } = composeAndValidate(sdls);
        if (errors.length > 0) {
            console.log('Composition Errors Found:');
            errors.map(err =>
                console.log(`* ${err.message}`))
        }
    }
    catch (err) {
        console.log(`${err}`);
    }
}

function syncGraphQLFilesToWorkbenchFile(context: vscode.ExtensionContext) {
    let generatedSchemasFolder = workspaceSchemasFolder();
    let selectedWbFile = context.workspaceState.get('selectedWbFile');

    let workbenchFile = getWorkbenchFile((selectedWbFile as any)?.path);
    let graphqlFilesFolder = readdirSync(generatedSchemasFolder, { encoding: "utf8" });

    graphqlFilesFolder.map(fileName => {
        if (fileName.includes('.graphql')) {
            let serviceName = fileName.slice(0, -8);
            let typeDefsString = readFileSync(resolve(generatedSchemasFolder, fileName), { encoding: "utf8" });
            if (workbenchFile.schemas[serviceName]) {
                if (typeDefsString != workbenchFile.schemas[serviceName]) {
                    workbenchFile.schemas[serviceName] = typeDefsString;
                }
            } else {
                workbenchFile.schemas[serviceName] = typeDefsString;
            }
        }
    });

    for (var key in workbenchFile.schemas) {
        let localSchemaFilePath = resolve(generatedSchemasFolder, `${key}.graphql`);
        if (!existsSync(localSchemaFilePath))
            writeFileSync(localSchemaFilePath, workbenchFile.schemas[key], { encoding: "utf8" });
    }

    saveWorkbenchFile(workbenchFile, (selectedWbFile as any).path);

    return workbenchFile;
}