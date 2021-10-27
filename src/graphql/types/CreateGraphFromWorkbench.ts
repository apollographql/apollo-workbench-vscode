/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL mutation operation: CreateGraphFromWorkbench
// ====================================================

export interface CreateGraphFromWorkbench_newService_apiKeys {
  __typename: "GraphApiKey";
  token: string;
}

export interface CreateGraphFromWorkbench_newService {
  __typename: "Service";
  id: string;
  apiKeys: CreateGraphFromWorkbench_newService_apiKeys[] | null;
}

export interface CreateGraphFromWorkbench {
  newService: CreateGraphFromWorkbench_newService | null;
}

export interface CreateGraphFromWorkbenchVariables {
  graphId: string;
  accountId: string;
  name?: string | null;
}
