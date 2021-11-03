/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

//==============================================================
// START Enums and Input Objects
//==============================================================

/**
 * Input for registering a partial schema to an implementing service.
 * One of the fields must be specified (validated server-side).
 * 
 * If a new partialSchemaSDL is passed in, this operation will store it before
 * creating the association.
 * 
 * If both the sdl and hash are specified, an error will be thrown if the provided
 * hash doesn't match our hash of the sdl contents. If the sdl field is specified,
 * the hash does not need to be and will be computed server-side.
 */
export interface PartialSchemaInput {
  hash?: string | null;
  sdl?: string | null;
}

//==============================================================
// END Enums and Input Objects
//==============================================================
