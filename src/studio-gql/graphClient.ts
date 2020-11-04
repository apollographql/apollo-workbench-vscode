import fetch from 'node-fetch';
import { createHttpLink, execute, FetchResult, gql, toPromise } from '@apollo/client/core';
import { UserMemberships } from './types/UserMemberships';
import { AccountServiceVariants } from './types/AccountServiceVariants';
import { GetGraphSchemas } from './types/GetGraphSchemas';

const userMemberships = gql`
    query UserMemberships {
        me {
            ... on User {   
                memberships {
                    account {
                        id
                    }
                }
            }
        }
    }`;
const accountServiceVariants = gql`
    query AccountServiceVariants($accountId: ID!) {
        account(id: $accountId) {
            services {
                id
                variants {
                    name
                }
            }
        }
    }`
const getGraphSchemas = gql`
    query GetGraphSchemas($id: ID!, $graphVariant: String!) {
      service(id: $id) {
        implementingServices(graphVariant: $graphVariant){
          ...on FederatedImplementingServices{
            services {
              name
              url
              activePartialSchema {
                sdl
              }
            }
          }
        }
      }
    }
  `;

export async function getUserMemberships(apiKey: string) {
    let result = await toPromise(execute(createLink(apiKey), { query: userMemberships }));
    return result.data as UserMemberships
}

export async function getAccountGraphs(apiKey: string, accountId: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: accountServiceVariants,
        variables: {
            "accountId": accountId
        }
    }));
    return result.data as AccountServiceVariants
}

export async function getGraphSchemasByVariant(apiKey: string, serviceId: string, graphVariant: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: getGraphSchemas,
        variables: {
            "id": serviceId,
            "graphVariant": graphVariant
        }
    }));
    return result.data as GetGraphSchemas
}

function createLink(apiKey: string) {
    return createHttpLink({
        fetch,
        uri: `https://engine-graphql.apollographql.com/api/graphql`,
        headers: {
            'x-api-key': apiKey,
            'apollographql-client-name': 'Apollo Workbench',
            'apollographql-client-version': '0.1'
        }
    });
}