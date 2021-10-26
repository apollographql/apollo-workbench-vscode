import {
  ApolloGateway,
  RemoteGraphQLDataSource,
  GatewayConfig,
  Experimental_UpdateComposition,
} from '@apollo/gateway';
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  printSchema,
} from 'graphql';
import { Headers } from 'apollo-server-env';
import { ServiceDefinition } from '@apollo/federation';
import { ServerManager } from '../workbench/serverManager';
import { StateManager } from '../workbench/stateManager';
import { window } from 'vscode';
import {
  WorkbenchUri,
  WorkbenchUriType,
} from '../workbench/file-system/WorkbenchUri';
import { log } from '../utils/logger';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { WorkbenchFederationProvider } from '../workbench/federationProvider';
// import { GraphQLDataSourceRequestKind } from '@apollo/gateway/dist/datasources/types';

function gatewayLog(message: string) {
  log(`GATEWAY-${message}`);
}

export class GatewayForwardHeadersDataSource extends RemoteGraphQLDataSource {
  serviceName = '';
  willSendRequest({ request, context }) {
    StateManager.settings_headersToForwardFromGateway.forEach((key) => {
      if (context.incomingHeaders[key])
        request.http.headers.set(key, context.incomingHeaders[key]);
      else
        gatewayLog(
          `Header ${key} was not found on incoming request, did you forget to set it in your client application?`,
        );
    });

    const service =
      ServerManager.instance.mocksWorkbenchFile?.schemas[this.serviceName];
    if (service) {
      service?.requiredHeaders?.forEach((requiredHeader) => {
        if (requiredHeader)
          request.http.headers.set(
            requiredHeader.key,
            context.incomingHeaders[requiredHeader.key] ??
              requiredHeader.value ??
              '',
          );
      });
    }
  }
  didReceiveResponse({ response, context }) {
    return response;
  }
}

export class OverrideApolloGateway extends ApolloGateway {
  protected async loadServiceDefinitions(
    config: GatewayConfig,
  ): ReturnType<Experimental_UpdateComposition> {
    if (StateManager.settings_tlsRejectUnauthorized)
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const newDefinitions: Array<ServiceDefinition> = [];

    const wb = ServerManager.instance.mocksWorkbenchFile;
    if (wb) {
      for (const serviceName in wb.schemas) {
        const service = wb.schemas[serviceName];

        if (service.shouldMock) {
          const typeDefs = parse(service.sdl);
          const url = `http://localhost:${ServerManager.instance.portMapping[serviceName]}`;
          newDefinitions.push({ name: serviceName, url, typeDefs });
        } else {
          const typeDefs = await WorkbenchFederationProvider.getRemoteTypeDefs(
            serviceName,
            wb,
          );
          if (typeDefs) {
            newDefinitions.push({
              name: serviceName,
              url: service.url,
              typeDefs: parse(typeDefs),
            });

            if (service.autoUpdateSchemaFromUrl)
              FileProvider.instance.writeFile(
                WorkbenchUri.supergraph(
                  ServerManager.instance.mocksWorkbenchFilePath,
                  serviceName,
                  WorkbenchUriType.SCHEMAS,
                ),
                Buffer.from(typeDefs),
                { create: true, overwrite: true },
              );
          } else {
            gatewayLog('Falling back to schema defined in workbench');
            newDefinitions.push({
              name: serviceName,
              url: service.url,
              typeDefs: parse(service.sdl),
            });
          }
        }
      }
    }

    return {
      isNewSchema: true,
      serviceDefinitions: newDefinitions,
    };
  }
}
