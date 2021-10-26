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
import { GraphQLDataSourceRequestKind } from '@apollo/gateway/dist/datasources/types';

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
          const typeDefs = await OverrideApolloGateway.getTypeDefs(
            service.url as string,
            serviceName,
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

  public static async getTypeDefs(
    serviceURLOverride: string,
    serviceName: string,
  ) {
    const source = new RemoteGraphQLDataSource({ url: serviceURLOverride });
    const requiredHeaders =
      ServerManager.instance.mocksWorkbenchFile?.schemas[serviceName]
        ?.requiredHeaders;
    const headers = new Headers();
    requiredHeaders?.forEach((requiredHeader) => {
      if (requiredHeader && requiredHeader.value)
        headers.append(requiredHeader.key, requiredHeader.value);
    });

    try {
      const request = {
        query: 'query __ApolloGetServiceDefinition__ { _service { sdl } }',
        http: {
          url: serviceURLOverride,
          method: 'POST',
          headers,
        },
      };

      const { data, errors } = await source.process({
        request,
        kind: GraphQLDataSourceRequestKind.HEALTH_CHECK,
        context: {},
      });
      if (data && !errors) {
        return data._service.sdl as string;
      } else if (errors) {
        errors.map((error) => gatewayLog(error.message));
        //If we got errors, it could be that the graphql server running at that url doesn't support Apollo Federation Spec
        //  In this case, we can try and get the server schema from introspection
        return await this.getSchemaByIntrospection(
          serviceURLOverride,
          source,
          headers,
        );
      }
    } catch (err: any) {
      if (err.code == 'ECONNREFUSED')
        gatewayLog(
          `Do you have service ${serviceName} running? \n\t${err.message}`,
        );
      else if (err.code == 'ENOTFOUND')
        gatewayLog(
          `Do you have service ${serviceName} running? \n\t${err.message}`,
        );
      else if (err.message == 'Only absolute URLs are supported')
        gatewayLog(`${serviceName}-${err.message}`);
      else
        return await this.getSchemaByIntrospection(
          serviceURLOverride,
          source,
          headers,
        );
    }

    return;
  }

  private static async getSchemaByIntrospection(
    serviceURLOverride: string,
    source: RemoteGraphQLDataSource,
    requiredHeaders: Headers,
  ) {
    const introspectionQuery = getIntrospectionQuery();
    const request = {
      query: introspectionQuery,
      http: {
        url: serviceURLOverride,
        method: 'POST',
        headers: requiredHeaders,
      },
    };

    const { data, errors } = await source.process({
      request,
      context: {},
      kind: GraphQLDataSourceRequestKind.HEALTH_CHECK,
    });
    if (data && !errors) {
      const schema = buildClientSchema(data as any);

      return printSchema(schema);
    } else if (errors) {
      errors.map((error) => gatewayLog(error.message));
      window.showErrorMessage(
        `Unable to get the schema from the underlying server running at ${serviceURLOverride}. Your GraphQL server must support the Apollo Federation specification or have introspection enabled`,
      );
    }
  }
}
