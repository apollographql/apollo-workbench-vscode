/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: MyAccountIds
// ====================================================

export interface MyAccountIds_me_InternalIdentity {
  __typename: "InternalIdentity" | "Service";
}

export interface MyAccountIds_me_User_memberships_account {
  __typename: "Account";
  id: string;
}

export interface MyAccountIds_me_User_memberships {
  __typename: "UserMembership";
  account: MyAccountIds_me_User_memberships_account;
}

export interface MyAccountIds_me_User {
  __typename: "User";
  memberships: MyAccountIds_me_User_memberships[];
}

export type MyAccountIds_me = MyAccountIds_me_InternalIdentity | MyAccountIds_me_User;

export interface MyAccountIds {
  /**
   * Current identity, null if not authenticated
   */
  me: MyAccountIds_me | null;
}
