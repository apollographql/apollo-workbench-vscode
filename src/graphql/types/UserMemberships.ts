/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: UserMemberships
// ====================================================

export interface UserMemberships_me_Service {
  __typename: "Service" | "InternalIdentity";
}

export interface UserMemberships_me_User_memberships_account {
  __typename: "Account";
  id: string;
  name: string;
}

export interface UserMemberships_me_User_memberships {
  __typename: "UserMembership";
  account: UserMemberships_me_User_memberships_account;
}

export interface UserMemberships_me_User {
  __typename: "User";
  memberships: UserMemberships_me_User_memberships[];
}

export type UserMemberships_me = UserMemberships_me_Service | UserMemberships_me_User;

export interface UserMemberships {
  /**
   * Current identity, null if not authenticated
   */
  me: UserMemberships_me | null;
}
