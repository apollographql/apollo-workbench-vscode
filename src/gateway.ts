import { ApolloGateway, RemoteGraphQLDataSource, GatewayConfig, Experimental_UpdateServiceDefinitions } from "@apollo/gateway";
import { parse } from 'graphql';
import { Headers } from "apollo-server-env";
import { ServiceDefinition } from '@apollo/federation';
import { portMapping } from "./workbench/setup";

function setupServiceOverrides() {
    let overrides: Array<{ name, url }> = [];

    for (var key in portMapping) {
        overrides.push({ name: key, url: `http://localhost:${portMapping[key]}` })
    }

    return overrides;
}

export class OverrideApolloGateway extends ApolloGateway {
    isInitialized = false;
    protected async loadServiceDefinitions(config: GatewayConfig): ReturnType<Experimental_UpdateServiceDefinitions> {
        let serviceOverrides = setupServiceOverrides() ?? [];
        if (serviceOverrides.length > 0) {
            let newDefinitions: Array<ServiceDefinition> = [];
            let fetchedServiceDefinitions;
            try {
                fetchedServiceDefinitions = await super.loadServiceDefinitions(config);
            } catch (err) {
                //Valid configuration doesn't exist yet
            }

            for (var i = 0; i < serviceOverrides.length; i++) {
                let name = serviceOverrides[i].name;
                let url = serviceOverrides[i].url;
                let typeDefs = await this.getTypeDefs(url);
                if (typeDefs)
                    newDefinitions.push({ name, url, typeDefs });
            }

            if (fetchedServiceDefinitions?.serviceDefinitions)
                for (var i = 0; i < fetchedServiceDefinitions.serviceDefinitions.length; i++) {
                    let originalService = fetchedServiceDefinitions.serviceDefinitions[i];
                    let alreadyDefined = fetchedServiceDefinitions.serviceDefinitions.findIndex(sd => sd.name == serviceOverrides[0].name) >= 0 ? true : false;
                    if (!alreadyDefined)
                        newDefinitions.push(originalService);
                }

            if (!this.isInitialized) {
                console.log('Composing schema from service list: ');
                newDefinitions.map(d => console.log(`  ${d.url}: ${d.name}`));
                this.isInitialized = true;
            }
            return {
                isNewSchema: true,
                compositionMetadata: fetchedServiceDefinitions?.compositionMetadata ?? { formatVersion: 123, id: '123' },
                serviceDefinitions: newDefinitions
            };
        } else {
            return super.loadServiceDefinitions(config);
        }
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