/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: CheckUserApiKey
// ====================================================

export interface CheckUserApiKey_me_Service {
  __typename: "Service" | "InternalIdentity";
}

export interface CheckUserApiKey_me_User {
  __typename: "User";
  id: string;
}

export type CheckUserApiKey_me = CheckUserApiKey_me_Service | CheckUserApiKey_me_User;

export interface CheckUserApiKey {
  /**
   * Current identity, null if not authenticated
   */
  me: CheckUserApiKey_me | null;
}
