import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { createHttpLink, execute, gql, toPromise } from '@apollo/client/core';
import { UserMemberships } from './types/UserMemberships';
import { AccountServiceVariants } from './types/AccountServiceVariants';
import { GetGraphSchemas } from './types/GetGraphSchemas';
import { GraphOperations } from './types/GraphOperations';
import {
  CheckUserApiKey,
  CheckUserApiKey_me_User,
} from './types/CheckUserApiKey';
import { StateManager } from '../workbench/stateManager';

const keyCheck = gql`
  query CheckUserApiKey {
    me {
      ... on User {
        id
      }
    }
  }
`;

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
  }
`;
const accountServiceVariants = gql`
  query AccountServiceVariants($accountId: ID!) {
    account(id: $accountId) {
      name
      services(includeDeleted: false) {
        id
        title
        devGraphOwner {
          ... on User {
            id
          }
        }
        variants {
          name
        }
      }
    }
  }
`;
const getGraphSchemas = gql`
  query GetGraphSchemas($id: ID!, $graphVariant: String!) {
    service(id: $id) {
      schema(tag: $graphVariant) {
        document
      }
      implementingServices(graphVariant: $graphVariant) {
        ... on NonFederatedImplementingService {
          graphID
        }
        ... on FederatedImplementingServices {
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
  query GraphOperations($id: ID!, $from: Timestamp!, $variant: String) {
    service(id: $id) {
      title
      stats(from: $from) {
        queryStats(filter: { schemaTag: $variant }) {
          groupBy {
            queryName
            queryId
            querySignature
          }
        }
      }
    }
  }
`;

const createGraphFromDesign = gql`
  mutation CreateGraphFromWorkbench(
    $graphId: ID!
    $accountId: ID!
    $name: String
  ) {
    newService(accountId: $accountId, id: $graphId, name: $name) {
      id
      apiKeys {
        token
      }
    }
  }
`;

const UPLOAD_AND_COMPOSE_PARTIAL_SCHEMA = gql`
  mutation UploadAndComposePartialSchema(
    $id: ID!
    $graphVariant: String!
    $name: String!
    $url: String!
    $revision: String!
    $activePartialSchema: PartialSchemaInput!
  ) {
    service(id: $id) {
      upsertImplementingServiceAndTriggerComposition(
        name: $name
        url: $url
        revision: $revision
        activePartialSchema: $activePartialSchema
        graphVariant: $graphVariant
      ) {
        compositionConfig {
          schemaHash
        }
        errors {
          message
        }
        didUpdateGateway: updatedGateway
        serviceWasCreated: wasCreated
      }
    }
  }
`;

export async function isValidKey(apiKey: string) {
  const result = await toPromise(
    execute(createLink({ apiKey }), { query: keyCheck }),
  );
  const data = result.data as CheckUserApiKey;
  if ((data.me as CheckUserApiKey_me_User)?.id) return true;
  return false;
}

export async function getUserMemberships(apiKey: string) {
  const result = await toPromise(
    execute(createLink({ apiKey }), { query: userMemberships }),
  );
  return result.data as UserMemberships;
}

export async function getAccountGraphs(apiKey: string, accountId: string) {
  const result = await toPromise(
    execute(createLink({ apiKey, accountId }), {
      query: accountServiceVariants,
      variables: {
        accountId: accountId,
      },
    }),
  );
  return result.data as AccountServiceVariants;
}

export async function getGraphOps(
  apiKey: string,
  graphId: string,
  graphVariant: string,
) {
  const days = StateManager.settings_daysOfOperationsToFetch;
  const result = await toPromise(
    execute(createLink({ apiKey, graphId, graphVariant }), {
      query: getGraphOperations,
      variables: {
        id: graphId,
        from: (-86400 * days).toString(),
        variant: graphVariant,
      },
    }),
  );
  return result.data as GraphOperations;
}

export async function getGraphSchemasByVariant(
  apiKey: string,
  graphId: string,
  graphVariant: string,
) {
  const result = await toPromise(
    execute(createLink({ apiKey, graphId, graphVariant }), {
      query: getGraphSchemas,
      variables: {
        id: graphId,
        graphVariant: graphVariant,
      },
    }),
  );
  return result.data as GetGraphSchemas;
}

export async function createGraph(
  apiKey: string,
  accountId: string,
  name: string,
) {
  const result = await toPromise(
    execute(createLink({ apiKey, accountId, graphId: name }), {
      query: createGraphFromDesign,
      variables: {
        accountId: accountId,
        graphId: name,
        name: name,
      },
    }),
  );
  const routerApiKey = result.data?.newService?.apiKeys[0]?.token;

  return result.errors ? result : routerApiKey;
}

export async function publishSubgraph(
  apiKey: string,
  graphId: string,
  subgraphName: string,
  subgraphUrl: string,
  schema: string,
) {
  const result = await toPromise(
    execute(createLink({ apiKey, graphId }), {
      query: UPLOAD_AND_COMPOSE_PARTIAL_SCHEMA,
      variables: {
        id: graphId,
        graphVariant: 'workbench',
        name: subgraphName,
        url: subgraphUrl, //subgraph.url ?? `http://localhost:${counter}`,
        revision: 'initial-creation-workbench',
        activePartialSchema: { sdl: schema },
      },
    }),
  );

  return result.errors ? result.errors : true;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json');
interface CreateLinkOptions {
  apiKey: string;
  accountId?: string;
  graphId?: string;
  graphVariant?: string;
}
function createLink(options: CreateLinkOptions) {
  const userId = options.apiKey.split(':')[1];
  const headers = {
    'x-api-key': options.apiKey,
    'studio-user-id': userId,
    'apollographql-client-name': 'Apollo Workbench',
    'apollographql-client-version': version,
  };

  if (options.accountId) headers['studio-account-id'] = options.accountId;
  if (options.graphId) headers['studio-graph-id'] = options.graphId;
  if (options.graphVariant)
    headers['studio-graph-graphVariant'] = options.graphVariant;

  if (StateManager.settings_apolloOrg) headers['apollo-sudo'] = 'true';

  return createHttpLink({
    fetch: fetch as any,
    headers,
    uri: vscode.workspace
      .getConfiguration('apollo-workbench')
      .get('apolloApiUrl') as string,
  });
}
