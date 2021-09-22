import {
  ApolloServer,
  gql
} from 'apollo-server';
import {
  addMocksToSchema,
  IMocks
} from '@graphql-tools/mock';
import { buildFederatedSchema } from '@apollo/federation';
import {
  OverrideApolloGateway,
  GatewayForwardHeadersDataSource,
} from '../graphql/graphRouter';

import { Uri, window, Progress, commands } from 'vscode';
import { Disposable } from 'vscode-languageclient';

import { StateManager } from './stateManager';
import { FileProvider } from './file-system/fileProvider';
import { addFederationSpecAsNeeded, extractEntityNames } from '../graphql/parsers/schemaParser';
import { log } from '../utils/logger';
import { ApolloWorkbenchFile, WorkbenchSchema } from './file-system/fileTypes';

const sandboxUrl = (port?)=> `https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A${port ?? StateManager.settings_gatewayServerPort}`;
        

export class ServerManager {
  private static _instance: ServerManager;
  static get instance(): ServerManager {
    if (!this._instance) this._instance = new ServerManager();
    return this._instance;
  }

  //For any service being mocked, we will store a port mapping of serviceName to port
  portMapping: { [serviceName: string]: string } = {};
  //serverState will hold the ApolloServer/ApolloGateway instances based on the ports they are running on
  private serversState: { [port: string]: any } = {};
  mocksWorkbenchFile?: ApolloWorkbenchFile;
  mocksWorkbenchFilePath: string = "";

  private corsConfiguration = {
    origin: '*',
    credentials: true,
  };

  async startSupergraphMocks(wbFilePath: string, progress?: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>) {
    if (StateManager.settings_tlsRejectUnauthorized)
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    log(`Setting up mocks`);
    this.mocksWorkbenchFile = FileProvider.instance.workbenchFileFromPath(
      wbFilePath,
    ) ?? undefined;
    if (this.mocksWorkbenchFile) {
      log(`Mocking workbench file: ${this.mocksWorkbenchFile.graphName}`);
      this.mocksWorkbenchFilePath = wbFilePath;
      const increment = 80 / Object.keys(this.mocksWorkbenchFile.schemas).length;
      for (const serviceName in this.mocksWorkbenchFile.schemas) {
        progress?.report({ message: `Mocking subgraph ${serviceName}`, increment });
        const subgraph = this.mocksWorkbenchFile.schemas[serviceName];
        const mocks = this.getMocks(subgraph);
        await this.startServer(
          serviceName,
          subgraph.sdl,
          mocks
        );
      }

      await this.startGateway(progress);
      await this.openSandbox(sandboxUrl());
    } else log(`No selected workbench file to setup`);
  }
  stopMocks() {
    if (this.serversState?.gateway)
      this.serversState.gateway.experimental_pollInterval = 10000000;

    for (const port in this.serversState) {
      if (port != 'gateway') {
        log(`Stopping server running at port ${port}...`);
        this.stopSubgraphOnPort(port);
      }
    }
    this.stopGateway();
    this.portMapping = {};
  }

  async restartSubgraph(wbFilePath: string, name: string, schema?: string){
    const serverPort = this.portMapping[name];
    if(this.mocksWorkbenchFile && wbFilePath == this.mocksWorkbenchFilePath && serverPort){
      //We have to restart a subgraph in currently running workbench file
      log(`Restarting Subgraph: ${name}`)
      this.stopSubgraphOnPort(serverPort);
      this.stopGateway();

      const subgraph = this.mocksWorkbenchFile?.schemas[name];
      const mocks = this.getMocks(subgraph);
      if(!schema) schema = subgraph.sdl;

      log(`\tStarting subgraph`);
      await this.startServer(name,schema,mocks);
      log(`\tStarting router`);
      await this.startGateway();
    }
  }
  private async startServer(
    serviceName: string,
    schemaString: string,
    mocks?: IMocks,
  ) {
    //Ensure we don't have an empty schema string - meaning a blank new service was created
    if (schemaString == '') {
      log(`No schema defined for ${serviceName} service.`);
      return;
    }

    //Establish what port the server should be running on
    const port = this.portMapping[serviceName] ?? this.getNextAvailablePort();

    //Check local server state to stop server running at a specific port
    if (this.serversState[port]) {
      log(`Stopping previous running server at port ${port}`);
      this.serversState[port].stop();
      delete this.serversState[port];
    }

    //Schema needs to be checked if Federation spec was added in an unexpected way
    //This will probably need to grow to cover all use cases from other libraries
    schemaString = addFederationSpecAsNeeded(schemaString);

    //Surround server startup in try/catch to prevent UI errors from schema errors - most likey a blank schema file
    try {
      const typeDefs = gql(schemaString);

      //Create mock for _Service type
      if (mocks) {
        mocks._Service = () => {
          return { sdl: schemaString };
        };
      } else {
        mocks = {
          _Service: () => {
            return { sdl: schemaString };
          },
        };
      }

      //Dynamically create __resolveReference resolvers based on defined entites in Graph
      const resolvers = {};
      const entities = extractEntityNames(schemaString);
      entities.forEach(
        (entity) => resolvers[entity] = {
          __resolveReference(parent, args) {
            return { ...parent };
          },
        }
      );

      const federatedSchema = buildFederatedSchema([{ typeDefs, resolvers }]);
      const mockedSchema = addMocksToSchema({ schema: federatedSchema, mocks, preserveResolvers: true });

      //Create and start up server locally
      const server = new ApolloServer({ schema: mockedSchema });

      //Set the port and server to local state
      this.serversState[port] = server;
      this.portMapping[serviceName] = port;

      server.listen({ port });
      await new Promise(resolve => setTimeout(resolve, 25));
    } catch (err: any) {
      if (err.message.includes('EOF')) {
        log(
          `${serviceName} has no contents, try defining a schema`,
        );
      } else {
        log(
          `${serviceName} had errors starting up mocked server: ${err}`,
        );
      }
    }
  }
  private stopSubgraphOnPort(port: string) {
    let serviceName = '';
    for (const sn in this.portMapping)
      if (this.portMapping[sn] == port) serviceName = sn;

    this.stopServer(port);

    if (this.portMapping[serviceName]) delete this.portMapping[serviceName];
  }

  statusBarMessage: Disposable = window.setStatusBarMessage('');
  private stopGateway() {
    const gatewayPort = StateManager.settings_gatewayServerPort;
    if (this.serversState[gatewayPort]) {
      log(`Stopping previous running gateway`);
      this.serversState[gatewayPort].stop();
      delete this.serversState[gatewayPort];
    }
    if (this.statusBarMessage) this.statusBarMessage.dispose();
  }
  private async startGateway(progress?: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>) {
    const gatewayPort = StateManager.settings_gatewayServerPort;
    if (this.serversState[gatewayPort]) {
      log(`Stopping previous running gateway`);
      this.serversState[gatewayPort].stop();
      delete this.serversState[gatewayPort];
    }

    progress?.report({ message: `Starting graph router...`, increment: 10 });

    const server = new ApolloServer({
      cors: this.corsConfiguration,
      gateway: new OverrideApolloGateway({
        debug: true,
        buildService({ url, name }) {
          const source = new GatewayForwardHeadersDataSource({ url });
          source.serviceName = name;
          return source;
        },
      }),
      context: ({ req }) => {
        return { incomingHeaders: req.headers };
      },
    });

    await server
      .listen({ port: gatewayPort })
      .then(async () => {
        log(`🚀 Interact with your gateway through Sandbox\n\t${sandboxUrl(gatewayPort)}`);
        ServerManager.instance.statusBarMessage = window.setStatusBarMessage(
          'Apollo Workbench Mocks Running',
        );
      })
      .then(undefined, (err) => {
        console.error('I am error');
      });

    this.serversState[gatewayPort] = server;

    progress?.report({ message: `Workbench Design Mocked Successfully`, increment: 10 });
  }
  private async openSandbox(sandboxUrl: string){
    if (StateManager.settings_openSandbox)
    await commands.executeCommand('vscode.open', Uri.parse(sandboxUrl));
  }
  private stopServer(port: string) {
    this.serversState[port].stop();
    delete this.serversState[port];
  }
  private getNextAvailablePort() {
    let port = StateManager.settings_startingServerPort;
    while (this.serversState[port]) port++;

    return port;
  }
  private getMocks(subgraph: WorkbenchSchema) {
    let customMocks = subgraph.customMocks;
    if(subgraph.shouldMock && customMocks){
      //By default we add the export shown to the user, but they may delete it
      if (!customMocks.includes('module.exports'))
        customMocks = customMocks.concat('\nmodule.exports = mocks');

      try {
        return eval(customMocks);
      } catch (err: any) {
        //Most likely  wasn't valid javascript
        log(err);
      }
    } 
    return {};
  }
}
