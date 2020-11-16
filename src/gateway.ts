import { ApolloGateway, RemoteGraphQLDataSource, GatewayConfig, Experimental_UpdateServiceDefinitions } from "@apollo/gateway";
import { parse } from 'graphql';
import { Headers } from "apollo-server-env";
import { ServiceDefinition } from '@apollo/federation';
import { FileWatchManager } from "./workbench/fileWatchManager";
import { ServerManager } from "./workbench/serverManager";
import { WorkbenchFileManager } from "./workbench/workbenchFileManager";

export class OverrideApolloGateway extends ApolloGateway {
    protected async loadServiceDefinitions(config: GatewayConfig): ReturnType<Experimental_UpdateServiceDefinitions> {
        let newDefinitions: Array<ServiceDefinition> = [];

        let wb = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (wb) {
            for (var serviceName in wb.schemas) {
                const service = wb.schemas[serviceName];
                if (service.shouldMock) {
                    let url = `http://localhost:${ServerManager.instance.portMapping[serviceName]}`;
                    newDefinitions.push({ name: serviceName, url, typeDefs: parse(service.sdl) });
                } else {
                    let typeDefs = await this.getTypeDefs(service.url as string);
                    if (typeDefs)
                        newDefinitions.push({ name: serviceName, url: service.url, typeDefs });
                }
            }
        }

        return {
            isNewSchema: true,
            serviceDefinitions: newDefinitions
        };
    }

    async getTypeDefs(serviceURLOverride: string) {
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
                const typeDefs = parse(data._service.sdl);

                return typeDefs;
            } else if (errors) {
                errors.map(error => console.log(error));
            }
        } catch (err) {

        }

        return;
    }
}