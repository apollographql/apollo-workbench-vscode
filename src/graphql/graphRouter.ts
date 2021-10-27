import {
  ApolloGateway,
  RemoteGraphQLDataSource,
  GatewayConfig,
  Experimental_UpdateComposition,
} from '@apollo/gateway-1';
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
