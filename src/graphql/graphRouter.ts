import { RemoteGraphQLDataSource as RemoteGraphQLDataSource_1 } from '@apollo/gateway-1';
import { RemoteGraphQLDataSource as RemoteGraphQLDataSource_2 } from '@apollo/gateway-2';
import { ServerManager } from '../workbench/serverManager';
import { StateManager } from '../workbench/stateManager';
import { log } from '../utils/logger';

function gatewayLog(message: string) {
  log(`GATEWAY-${message}`);
}

export class GatewayForwardHeadersDataSource_1 extends RemoteGraphQLDataSource_1 {
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
export class GatewayForwardHeadersDataSource_2 extends RemoteGraphQLDataSource_2 {
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
