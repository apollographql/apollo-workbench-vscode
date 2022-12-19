/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: GraphOperations
// ====================================================

export interface GraphOperations_service_statsWindow_queryStats_groupBy {
  __typename: "ServiceQueryStatsDimensions";
  queryName: string | null;
  queryId: string | null;
  querySignature: string | null;
}

export interface GraphOperations_service_statsWindow_queryStats {
  __typename: "ServiceQueryStatsRecord";
  /**
   * Dimensions of ServiceQueryStats that can be grouped by.
   */
  groupBy: GraphOperations_service_statsWindow_queryStats_groupBy;
}

export interface GraphOperations_service_statsWindow {
  __typename: "ServiceStatsWindow";
  queryStats: GraphOperations_service_statsWindow_queryStats[];
}

export interface GraphOperations_service {
  __typename: "Service";
  /**
   * The graph's name.
   */
  title: string;
  statsWindow: GraphOperations_service_statsWindow | null;
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
  variant?: string | null;
}
