import { ApolloServer, gql } from "apollo-server";
import plugin from 'apollo-server-plugin-operation-registry';
import { buildFederatedSchema } from "@apollo/federation";
import { ApolloServerPluginUsageReportingDisabled } from 'apollo-server-core';

import { StateManager } from "./stateManager";
import { OverrideApolloGateway } from "../gateway";
import { WorkbenchFileManager } from "./workbenchFileManager";

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

    startMocks() {
        console.log(`${name}:Setting up mocks`);
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            console.log(`${name}:Mocking workbench file: ${workbenchFile.graphName}`);
            for (var serviceName in workbenchFile.schemas) {
                if (workbenchFile.schemas[serviceName].shouldMock)
                    this.startServer(serviceName, workbenchFile.schemas[serviceName].sdl);
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
        this.portMapping = {};
    }
    startServer(serviceName: string, schemaString: string) {
        const port = this.portMapping[serviceName] ?? this.getNextAvailablePort();
        console.log(`${name}:Starting ${serviceName} on port ${port}`);
        if (this.serversState[port]) {
            console.log(`${name}:Stopping previous running server at port ${port}`);
            this.serversState[port].stop();
            delete this.serversState[port];
        }

        if (schemaString == '') {
            console.log(`${name}:No schema defined for ${serviceName} service.`)
            return;
        }

        try {
            const typeDefs = gql(schemaString);
            const server = new ApolloServer({
                schema: buildFederatedSchema(typeDefs),
                mocks: true,
                mockEntireSchema: false,
                engine: false,
                subscriptions: false
            });
            server.listen({ port }).then(({ url }) => console.log(`${name}:🚀 ${serviceName} mocked server ready at ${url}`));

            //Set the mappings to the server that is starting up
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
    stopServerByName(serviceName: string) {
        let serverPort = this.portMapping[serviceName];
        if (serverPort) {
            this.serversState[serverPort].stop();
            delete this.serversState[serverPort];
        }
        if (this.portMapping[serviceName])
            delete this.portMapping[serviceName];
    }
    stopServerOnPort(port: string) {
        let serviceName = '';
        for (var sn in this.portMapping)
            if (this.portMapping[sn] == port)
                serviceName = sn;

        this.stopServer(port);

        if (this.portMapping[serviceName])
            delete this.portMapping[serviceName];
    }
    startGateway() {
        let gatewayPort = StateManager.instance.settings_gatewayServerPort;
        if (this.serversState[gatewayPort]) {
            console.log(`${name}:Stopping previous running gateway`);
            this.serversState[gatewayPort].stop();
            delete this.serversState[gatewayPort];
        }
        //We always have a gateway running in the background and change it's pollInterval when not in use
        //This is a workaround because `server.stop()` doesn't stop that polling and becomes a memory leak if releasing the serer
        if (!this.serversState['gateway']) {
            console.log(`${name}:No gateway instance stored, creating instance`)
            this.serversState['gateway'] = new OverrideApolloGateway({ debug: true });
        } else {
            console.log(`${name}:Changing gateway instance polling interval to 10s`);
            this.serversState['gateway'].experimental_pollInterval = StateManager.instance.settings_gatewayReCompositionInterval ?? 10000;
        }

        const graphApiKey = StateManager.instance.settings_apiKey;
        const graphVariant = StateManager.instance.settings_graphVariant;
        let plugins = [ApolloServerPluginUsageReportingDisabled()];
        const shouldRunOpReg = StateManager.instance.settings_shouldRunOpRegistry;
        if (shouldRunOpReg) {
            console.log(`${name}:Enabling operation registry for ${graphVariant}`);
            plugins = [ApolloServerPluginUsageReportingDisabled(), plugin({ graphVariant, forbidUnregisteredOperations: shouldRunOpReg, debug: true })()];
        }

        const server = new ApolloServer({
            gateway: this.serversState['gateway'],
            subscriptions: false,
            apollo: {
                key: graphApiKey,
                graphVariant
            },
            plugins
        });

        server.listen({ port: gatewayPort }).then(({ url }) => {
            console.log(`${name}:🚀 Apollo Workbench gateway ready at ${url}`);
        });

        this.serversState[gatewayPort] = server;
    }
    private stopServer(port: string) {
        this.serversState[port].stop();
        delete this.serversState[port];
    }
    private getNextAvailablePort() {
        let port = StateManager.instance.settings_startingServerPort;
        while (this.serversState[port])
            port++;

        return port;
    }
}