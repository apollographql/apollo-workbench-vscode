import {
  ApolloServer,
  gql
} from 'apollo-server';
import {
  addMocksToSchema,
  IMocks
} from 'graphql-tools';
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
    const workbenchFile = FileProvider.instance.workbenchFileFromPath(
      wbFilePath,
    );
    if (workbenchFile) {
      log(`Mocking workbench file: ${workbenchFile.graphName}`);
      FileProvider.instance.loadedWorkbenchFile = workbenchFile;
      const increment = 80 / Object.keys(workbenchFile.schemas).length;
      for (const serviceName in workbenchFile.schemas) {
        //Check if we should be mocking this service
        if (workbenchFile.schemas[serviceName].shouldMock) {
          progress?.report({ message: `Mocking subgraph ${serviceName}`, increment });
          //Check if Custom Mocks are defined in workbench
          let customMocks = workbenchFile.schemas[serviceName].customMocks;
          if (customMocks) {
            //By default we add the export shown to the user, but they may delete it
            if (!customMocks.includes('module.exports'))
              customMocks = customMocks.concat('\nmodule.exports = mocks');

            try {
              const mocks = eval(customMocks);
              this.startServer(
                serviceName,
                workbenchFile.schemas[serviceName].sdl,
                mocks,
              );
            } catch (err) {
              //Most likely  wasn't valid javascript
              log(err);
              this.startServer(
                serviceName,
                workbenchFile.schemas[serviceName].sdl,
              );
            }
          } else
            await this.startServer(
              serviceName,
              workbenchFile.schemas[serviceName].sdl,
            );
        } else {
          progress?.report({ message: `Skipping mocks for ${serviceName} due to setting`, increment });
        }
      }

      await this.startGateway(progress);
    } else log(`No selected workbench file to setup`);
  }
  stopMocks() {
    if (this.serversState?.gateway)
      this.serversState.gateway.experimental_pollInterval = 10000000;

    for (const port in this.serversState) {
      if (port != 'gateway') {
        log(`Stopping server running at port ${port}...`);
        this.stopServerOnPort(port);
      }
    }
    this.stopGateway();
    this.portMapping = {};
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
    } catch (err) {
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
  private stopServerOnPort(port: string) {
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
        const sandboxUrl = `https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A${gatewayPort}`;
        log(`🚀 Interact with your gateway through Sandbox\n\t${sandboxUrl}`);
        ServerManager.instance.statusBarMessage = window.setStatusBarMessage(
          'Apollo Workbench Mocks Running',
        );

        await commands.executeCommand('vscode.open', Uri.parse(sandboxUrl));
      })
      .then(undefined, (err) => {
        console.error('I am error');
      });

    this.serversState[gatewayPort] = server;

    progress?.report({ message: `Workbench Design Mocked Successfully`, increment: 10 });
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
}
