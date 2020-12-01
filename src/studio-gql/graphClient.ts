import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { createHttpLink, execute, FetchResult, gql, toPromise } from '@apollo/client/core';
import { UserMemberships } from './types/UserMemberships';
import { AccountServiceVariants } from './types/AccountServiceVariants';
import { GetGraphSchemas } from './types/GetGraphSchemas';
import { GraphOperations } from './types/GraphOperations';
import { CheckUserApiKey, CheckUserApiKey_me_User } from './types/CheckUserApiKey';

const keyCheck = gql`
    query CheckUserApiKey {
        me {
            ...on User {
                id
            }
        }
    }`;

const userMemberships = gql`
    query UserMemberships {
        me {
            ... on User {   
                memberships {
                    account {
                        id
                        name
                    }
                }
            }
        }
    }`;
const accountServiceVariants = gql`
    query AccountServiceVariants($accountId: ID!) {
        account(id: $accountId) {
            name
            services  {
                id
                title
                devGraphOwner {
                    ...on User {
                        id
                    }
                }
                variants {
                    name
                }
            }
        }
    }`
const getGraphSchemas = gql`
    query GetGraphSchemas($id: ID!, $graphVariant: String!) {
      service(id: $id) {
          schema(tag:$graphVariant) {
              document 
          }
        implementingServices(graphVariant: $graphVariant){
            ...on NonFederatedImplementingService {
                graphID
            }
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
const getGraphOperations = gql`
  query GraphOperations($id: ID! $from: Timestamp!) {
      service(id: $id) {
          stats(from: $from) {
              queryStats {
                  groupBy {
                      queryName
                      queryId  
                      querySignature
                  }
              }
          }
      }
  }`

export async function isValidKey(apiKey: string) {
    let result = await toPromise(execute(createLink(apiKey), { query: keyCheck }));
    let data = result.data as CheckUserApiKey;
    if ((data.me as CheckUserApiKey_me_User)?.id) return true;
    return false;

}

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

export async function getGraphOps(apiKey: string, graphId: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: getGraphOperations,
        variables: {
            "id": graphId,
            "from": (-86400 * 30).toString()
        }
    }));
    return result.data as GraphOperations
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

const { version } = require('../../package.json');
function createLink(apiKey: string) {
    return createHttpLink({
        fetch,
        uri: vscode.workspace.getConfiguration("apollo-workbench").get('apolloApiUrl') as string,
        headers: {
            'x-api-key': apiKey,
            'apollographql-client-name': 'Apollo Workbench',
            'apollographql-client-version': version
        }
    });
}