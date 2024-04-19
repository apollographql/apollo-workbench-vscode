import * as vscode from 'vscode';
import fetch from 'node-fetch';
import {
  createHttpLink,
  DocumentNode,
  execute,
  gql,
  toPromise,
} from '@apollo/client/core';
import { GraphOperations } from './types/GraphOperations';
import {
  CheckUserApiKeyQuery,
  CheckUserApiKeyDocument,
  UserMembershipsDocument,
  UserMembershipsQuery,
  AccountServiceVariantsDocument,
  AccountServiceVariantsQuery,
  GetGraphSchemasDocument,
  GetGraphSchemasQuery,
} from '../_generated_/typed-document-nodes';
import { StateManager } from '../workbench/stateManager';
import { getOperationName } from '@apollo/client/utilities';

const getGraphOperations = gql`
  query GraphOperations($id: ID!, $from: Timestamp!, $variant: String) {
    service(id: $id) {
      title
      statsWindow(from: $from) {
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

export async function isValidKey(apiKey: string) {
  const result = await toPromise(
    execute(
      createLink(getOperationName(CheckUserApiKeyDocument) ?? '', apiKey),
      {
        query: CheckUserApiKeyDocument,
      },
    ),
  );
  const data = result.data as CheckUserApiKeyQuery;
  if (data.me?.id) return true;
  return false;
}

export async function getUserMemberships() {
  const result = await useQuery(UserMembershipsDocument);
  return result.data as UserMembershipsQuery;
}

export async function getAccountGraphs(accountId: string) {
  const result = await useQuery(AccountServiceVariantsDocument, {
    accountId: accountId,
  });
  return result.data as AccountServiceVariantsQuery;
}

export async function getGraphOps(graphId: string, graphVariant: string) {
  const days = StateManager.settings_daysOfOperationsToFetch;
  const result = await useQuery(getGraphOperations, {
    id: graphId,
    from: (-86400 * days).toString(),
    variant: graphVariant,
  });

  return result.data as GraphOperations;
}

export async function getGraphSchemasByVariant(
  graphId: string,
  graphVariant: string,
) {
  const result = await useQuery(GetGraphSchemasDocument, {
    id: graphId,
    graphVariant,
  });
  return result.data as GetGraphSchemasQuery;
}

const useQuery = (query: DocumentNode, variables = {}) =>
  toPromise(
    execute(createLink(getOperationName(query) ?? ''), {
      query,
      variables,
    }),
  );

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json');
function createLink(
  operationName: string,
  apiKey: string = StateManager.instance.globalState_userApiKey,
) {
  const userId = apiKey?.split(':')[1];
  const headers = {
    'x-api-key': apiKey,
    'studio-user-id': userId,
    'apollographql-client-name': 'Apollo Workbench',
    'apollographql-client-version': version,
  };

  if (StateManager.settings_apolloOrg) headers['apollo-sudo'] = 'true';

  let uri =
    operationName == 'GraphOperations'
      ? 'https://graphql.api.apollographql.com/api/graphql'
      : 'https://api.apollographql.com/graphql';

  if (StateManager.settings_apolloApiUrl)
    uri = StateManager.settings_apolloApiUrl;

  return createHttpLink({
    fetch: fetch as any,
    headers,
    uri,
  });
}
