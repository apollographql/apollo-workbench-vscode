/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: GetGraphSchemas
// ====================================================

export interface GetGraphSchemas_service_schema {
  __typename: "Schema";
  document: any;
}

export interface GetGraphSchemas_service_implementingServices_NonFederatedImplementingService {
  __typename: "NonFederatedImplementingService";
  /**
   * Identifies which graph this non-implementing service belongs to.
   * Formerly known as "service_id"
   */
  graphID: string;
}

export interface GetGraphSchemas_service_implementingServices_FederatedImplementingServices_services_activePartialSchema {
  __typename: "PartialSchema";
  /**
   * The enriched sdl of a partial schema
   */
  sdl: string;
}

export interface GetGraphSchemas_service_implementingServices_FederatedImplementingServices_services {
  __typename: "FederatedImplementingService";
  /**
   * Name of the implementing service
   */
  name: string;
  /**
   * URL of the graphql endpoint of the implementing service
   */
  url: string | null;
  /**
   * An implementing service could have multiple inactive partial schemas that were previously uploaded
   * activePartialSchema returns the one that is designated to be used for composition for a given graph-variant
   */
  activePartialSchema: GetGraphSchemas_service_implementingServices_FederatedImplementingServices_services_activePartialSchema;
}

export interface GetGraphSchemas_service_implementingServices_FederatedImplementingServices {
  __typename: "FederatedImplementingServices";
  services: GetGraphSchemas_service_implementingServices_FederatedImplementingServices_services[];
}

export type GetGraphSchemas_service_implementingServices = GetGraphSchemas_service_implementingServices_NonFederatedImplementingService | GetGraphSchemas_service_implementingServices_FederatedImplementingServices;

export interface GetGraphSchemas_service {
  __typename: "Service";
  /**
   * Get a schema by hash OR current tag
   */
  schema: GetGraphSchemas_service_schema | null;
  /**
   * List of implementing services that comprise a graph. A non-federated graph should have a single implementing service.
   * Set includeDeleted to see deleted implementing services.
   */
  implementingServices: GetGraphSchemas_service_implementingServices | null;
}

export interface GetGraphSchemas {
  /**
   * Service by ID
   */
  service: GetGraphSchemas_service | null;
}

export interface GetGraphSchemasVariables {
  id: string;
  graphVariant: string;
}
