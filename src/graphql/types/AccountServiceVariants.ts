/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: AccountServiceVariants
// ====================================================

export interface AccountServiceVariants_account_services_devGraphOwner {
  __typename: 'User';
  id: string;
}

export interface AccountServiceVariants_account_services_variants {
  __typename: 'GraphVariant';
  /**
   * Name of the variant, like `variant`.
   */
  name: string;
}

export interface AccountServiceVariants_account_services {
  __typename: 'Service';
  id: string;
  title: string;
  devGraphOwner: AccountServiceVariants_account_services_devGraphOwner | null;
  /**
   * The list of variants that exist for this graph
   */
  variants: AccountServiceVariants_account_services_variants[];
}

export interface AccountServiceVariants_account {
  __typename: 'Account';
  name: string;
  services: AccountServiceVariants_account_services[];
}

export interface AccountServiceVariants {
  /**
   * Account by ID
   */
  account: AccountServiceVariants_account | null;
}

export interface AccountServiceVariantsVariables {
  accountId: string;
}
