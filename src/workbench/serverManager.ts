import { addMockFunctionsToSchema, ApolloServer, gql, IMocks } from "apollo-server";
import plugin from 'apollo-server-plugin-operation-registry';
import { buildFederatedSchema } from "@apollo/federation";
import { ApolloServerPluginUsageReportingDisabled } from 'apollo-server-core';

import { StateManager } from "./stateManager";
import { OverrideApolloGateway, GatewayForwardHeadersDataSource } from "../graphql/graphRouter";
import { FileProvider } from "./file-system/fileProvider";
import { extractEntityNames } from "../graphql/parsers/schemaParser";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { workspace, Uri, window, StatusBarAlignment, tasks } from "vscode";
import { execSync } from "child_process";
import { Disposable } from "vscode-languageclient";

const { name } = require('../../package.json');

export class ServerManager {
    private static _instance: ServerManager;
    static get instance(): ServerManager {
        if (!this._instance)
            this._instance = new ServerManager();
        return this._instance;
    }

    //For any service being mocked, we will store a port mapping of serviceName to port
    portMapping: { [serviceName: string]: string } = {};
    //serverState will hold the ApolloServer/ApolloGateway instances based on the ports they are running on
    private serversState: { [port: string]: any } = {};

    startSupergraphMocks(wbFilePath: string) {
        if (StateManager.settings_tlsRejectUnauthorized) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        console.log(`${name}:Setting up mocks`);
        let workbenchFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
        if (workbenchFile) {
            console.log(`${name}:Mocking workbench file: ${workbenchFile.graphName}`);
            FileProvider.instance.loadedWorkbenchFile = workbenchFile;
            for (var serviceName in workbenchFile.schemas) {
                //Check if we should be mocking this service
                if (workbenchFile.schemas[serviceName].shouldMock) {
                    //Check if Custom Mocks are defined in workbench
                    let customMocks = workbenchFile.schemas[serviceName].customMocks;
                    if (customMocks) {
                        //By default we add the export shown to the user, but they may delete it
                        if (!customMocks.includes('module.exports'))
                            customMocks = customMocks.concat('\nmodule.exports = mocks');

                        try {
                            let mocks = eval(customMocks);
                            this.startServer(serviceName, workbenchFile.schemas[serviceName].sdl, mocks);
                        } catch (err) {
                            //Most likely  wasn't valid javascript
                            console.log(err);
                            this.startServer(serviceName, workbenchFile.schemas[serviceName].sdl);
                        }
                    } else
                        this.startServer(serviceName, workbenchFile.schemas[serviceName].sdl);
                }
            }

            this.startGateway();
        } else
            console.log(`${name}:No selected workbench file to setup`);
    }
    stopMocks() {
        if (this.serversState?.gateway)
            this.serversState.gateway.experimental_pollInterval = 10000000;

        for (var port in this.serversState) {
            if (port != 'gateway') {
                console.log(`${name}:Stopping server running at port ${port}...`);
                this.stopServerOnPort(port);
            }
        }
        this.stopGateway();
        this.portMapping = {};
    }
    private startServer(serviceName: string, schemaString: string, mocks?: IMocks) {
        //Ensure we don't have an empty schema string - meaning a blank new service was created
        if (schemaString == '') {
            console.log(`${name}:No schema defined for ${serviceName} service.`)
            return;
        }

        //Establish what port the server should be running on
        const port = this.portMapping[serviceName] ?? this.getNextAvailablePort();
        console.log(`${name}:Starting ${serviceName} on port ${port}`);

        //Check local server state to stop server running at a specific port
        if (this.serversState[port]) {
            console.log(`${name}:Stopping previous running server at port ${port}`);
            this.serversState[port].stop();
            delete this.serversState[port];
        }

        //Surround server startup in try/catch to prevent UI errors from schema errors - most likey a blank schema file
        try {
            const typeDefs = gql(schemaString);

            //Create mock for _Service type
            if (mocks) {
                mocks._Service = () => { return { sdl: schemaString } }
            } else {
                mocks = { _Service: () => { return { sdl: schemaString } } };
            }

            //Dynamically create __resolveReference resolvers based on defined entites in Graph
            let resolvers = {};
            let entities = extractEntityNames(schemaString);
            entities.forEach(entity => resolvers[entity] = { __resolveReference(parent, args) { return { ...parent } } });

            //Build federated schema with resolvers and then add custom mocks to that schema
            const schema = buildFederatedSchema({ typeDefs, resolvers });
            addMockFunctionsToSchema({ schema, mocks, preserveResolvers: true });

            //Create and start up server locally
            const server = new ApolloServer({
                schema,
                subscriptions: false
            });
            server.listen({ port }).then(({ url }) => console.log(`${name}:🚀 ${serviceName} mocked server ready at ${url}`));

            //Set the port and server to local state
            this.serversState[port] = server;
            this.portMapping[serviceName] = port;
        } catch (err) {
            if (err.message.includes('EOF')) {
                console.log(`${name}:${serviceName} has no contents, try defining a schema`);
            } else {
                console.log(`${name}:${serviceName} had errors starting up mocked server: ${err}`);
            }
        }
    }
    private stopServerOnPort(port: string) {
        let serviceName = '';
        for (var sn in this.portMapping)
            if (this.portMapping[sn] == port)
                serviceName = sn;

        this.stopServer(port);

        if (this.portMapping[serviceName])
            delete this.portMapping[serviceName];
    }
    statusBarMessage: Disposable = window.setStatusBarMessage("");
    private stopGateway() {
        let gatewayPort = StateManager.settings_gatewayServerPort;
        if (this.serversState[gatewayPort]) {
            console.log(`${name}:Stopping previous running gateway`);
            this.serversState[gatewayPort].stop();
            delete this.serversState[gatewayPort];
        }
        if (this.statusBarMessage)
            this.statusBarMessage.dispose();
    }
    private startGateway() {
        let gatewayPort = StateManager.settings_gatewayServerPort;
        if (this.serversState[gatewayPort]) {
            console.log(`${name}:Stopping previous running gateway`);
            this.serversState[gatewayPort].stop();
            delete this.serversState[gatewayPort];
        }

        const graphApiKey = StateManager.settings_apiKey;
        const graphVariant = StateManager.settings_graphVariant;
        let plugins = [ApolloServerPluginUsageReportingDisabled()];
        const shouldRunOpReg = StateManager.settings_shouldRunOpRegistry;
        if (shouldRunOpReg) {
            console.log(`${name}:Enabling operation registry for ${graphVariant}`);
            plugins = [ApolloServerPluginUsageReportingDisabled()];//, plugin({ graphVariant, forbidUnregisteredOperations: shouldRunOpReg, debug: true })()];
        }

        const server = new ApolloServer({
            gateway: new OverrideApolloGateway({
                debug: true,
                buildService({ url, name }) {
                    let source = new GatewayForwardHeadersDataSource({ url });
                    source.serviceName = name;
                    return source;
                }
            }),
            subscriptions: false,
            apollo: {
                key: graphApiKey,
                graphVariant
            },
            plugins,
            context: ({ req }) => {
                return { incomingHeaders: req.headers };
            }
        });

        server.listen({ port: gatewayPort }).then(({ url }) => {
            console.log(`${name}:🚀 Apollo Workbench gateway ready at ${url}`);
            ServerManager.instance.statusBarMessage = window.setStatusBarMessage("Apollo Workbench Mocks Running");
        }).then(undefined, err => {
            console.error('I am error');
        });

        this.serversState[gatewayPort] = server;
    }
    private stopServer(port: string) {
        this.serversState[port].stop();
        delete this.serversState[port];
    }
    private getNextAvailablePort() {
        let port = StateManager.settings_startingServerPort;
        while (this.serversState[port])
            port++;

        return port;
    }
}