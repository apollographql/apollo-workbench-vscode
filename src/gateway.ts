import { ApolloGateway, RemoteGraphQLDataSource, GatewayConfig, Experimental_UpdateServiceDefinitions } from "@apollo/gateway";
import { parse } from 'graphql';
import { Headers } from "apollo-server-env";
import { ServiceDefinition } from '@apollo/federation';
import { ServerManager } from "./workbench/serverManager";
import { FileProvider, WorkbenchUri, WorkbenchUriType } from "./utils/files/fileProvider";

function log(message: string) { console.log(`GATEWAY-${message}`); }

export class OverrideApolloGateway extends ApolloGateway {
    protected async loadServiceDefinitions(config: GatewayConfig): ReturnType<Experimental_UpdateServiceDefinitions> {
        let newDefinitions: Array<ServiceDefinition> = [];

        let wb = FileProvider.instance.currrentWorkbench;
        if (wb) {
            for (var serviceName in wb.schemas) {
                const service = wb.schemas[serviceName];

                if (service.shouldMock) {
                    let typeDefs = parse(service.sdl);
                    let url = `http://localhost:${ServerManager.instance.portMapping[serviceName]}`;
                    newDefinitions.push({ name: serviceName, url, typeDefs });
                } else {
                    let typeDefs = await OverrideApolloGateway.getTypeDefs(service.url as string);
                    if (typeDefs) {
                        newDefinitions.push({ name: serviceName, url: service.url, typeDefs: parse(typeDefs) });
                        FileProvider.instance.writeFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS), Buffer.from(typeDefs), { create: true, overwrite: true })
                    } else {
                        log("Falling back to schema defined in workbench");
                        newDefinitions.push({ name: serviceName, url: service.url, typeDefs: parse(service.sdl) });
                    }
                }
            }
        }

        return {
            isNewSchema: true,
            serviceDefinitions: newDefinitions
        };
    }

    public static async getTypeDefs(serviceURLOverride: string) {
        try {
            const request = {
                query: 'query __ApolloGetServiceDefinition__ { _service { sdl } }',
                http: {
                    url: serviceURLOverride,
                    method: 'POST',
                    headers: new Headers()
                },
            };

            let source = new RemoteGraphQLDataSource({ url: serviceURLOverride, });

            let { data, errors } = await source.process({ request, context: {} });
            if (data && !errors) {
                return data._service.sdl as string;
            } else if (errors) {
                errors.map(error => log(error.message));
            }
        } catch (err) {
            log(`Do you have your service running? \n\t${err.message}`)
        }

        return;
    }
}