/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: GraphOperations
// ====================================================

export interface GraphOperations_service_stats_queryStats_groupBy {
  __typename: "ServiceQueryStatsDimensions";
  clientName: string | null;
  clientVersion: string | null;
  queryName: string | null;
  queryId: string | null;
  querySignature: string | null;
}

export interface GraphOperations_service_stats_queryStats {
  __typename: "ServiceQueryStatsRecord";
  /**
   * Dimensions of ServiceQueryStats that can be grouped by.
   */
  groupBy: GraphOperations_service_stats_queryStats_groupBy;
}

export interface GraphOperations_service_stats {
  __typename: "ServiceStatsWindow";
  queryStats: GraphOperations_service_stats_queryStats[];
}

export interface GraphOperations_service {
  __typename: "Service";
  stats: GraphOperations_service_stats;
}

export interface GraphOperations {
  /**
   * Service by ID
   */
  service: GraphOperations_service | null;
}

export interface GraphOperationsVariables {
  id: string;
  from: any;
}
