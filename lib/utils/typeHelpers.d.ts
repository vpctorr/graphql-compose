import type { GraphQLType, GraphQLNamedType, GraphQLOutputType, GraphQLInputType } from 'graphql';
import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { UnionTypeComposer } from '../UnionTypeComposer';
import { NonNullComposer } from '../NonNullComposer';
import { ListComposer } from '../ListComposer';
import { ThunkComposer } from '../ThunkComposer';
import type { TypeAsString } from '../TypeMapper';
import type { SchemaComposer } from '../SchemaComposer';
export type AnyTypeComposer<TContext> = NamedTypeComposer<TContext> | ListComposer<any> | NonNullComposer<any> | ThunkComposer<any, any>;
export type NamedTypeComposer<TContext> = ObjectTypeComposer<any, TContext> | InputTypeComposer<TContext> | EnumTypeComposer<TContext> | InterfaceTypeComposer<any, TContext> | UnionTypeComposer<any, TContext> | ScalarTypeComposer<TContext>;
export type ComposeNamedOutputType<TContext> = ObjectTypeComposer<any, TContext> | EnumTypeComposer<TContext> | ScalarTypeComposer<TContext> | InterfaceTypeComposer<any, TContext> | UnionTypeComposer<any, TContext>;
export type ComposeOutputType<TContext> = ComposeNamedOutputType<TContext> | NonNullComposer<any> | ListComposer<any> | ThunkComposer<any, GraphQLOutputType>;
export type ComposeOutputTypeDefinition<TContext> = Readonly<ComposeOutputType<TContext>> | Readonly<GraphQLOutputType> | TypeAsString | ReadonlyArray<Readonly<ComposeOutputType<TContext>> | Readonly<GraphQLOutputType> | TypeAsString | ReadonlyArray<Readonly<ComposeOutputType<TContext>> | Readonly<GraphQLOutputType> | TypeAsString>>;
export type ComposeNamedInputType<TContext> = InputTypeComposer<TContext> | EnumTypeComposer<TContext> | ScalarTypeComposer<TContext>;
export type ComposeInputType = ComposeNamedInputType<any> | ThunkComposer<ComposeNamedInputType<any>, GraphQLInputType> | NonNullComposer<ComposeNamedInputType<any> | ThunkComposer<ComposeNamedInputType<any>, GraphQLInputType> | ListComposer<any>> | ListComposer<ComposeNamedInputType<any> | ThunkComposer<ComposeNamedInputType<any>, GraphQLInputType> | ListComposer<any> | NonNullComposer<any>>;
export type ComposeInputTypeDefinition = TypeAsString | Readonly<ComposeInputType> | Readonly<GraphQLInputType> | ReadonlyArray<TypeAsString | Readonly<ComposeInputType> | Readonly<GraphQLInputType> | ReadonlyArray<TypeAsString | Readonly<ComposeInputType> | Readonly<GraphQLInputType>>>;
export declare function isTypeNameString(str: string): boolean;
export declare function isWrappedTypeNameString(str: string): boolean;
export declare function isTypeDefinitionString(str: string): boolean;
export declare function isSomeOutputTypeDefinitionString(str: string): boolean;
export declare function isSomeInputTypeDefinitionString(str: string): boolean;
export declare function isOutputTypeDefinitionString(str: string): boolean;
export declare function isInputTypeDefinitionString(str: string): boolean;
export declare function isEnumTypeDefinitionString(str: string): boolean;
export declare function isScalarTypeDefinitionString(str: string): boolean;
export declare function isInterfaceTypeDefinitionString(str: string): boolean;
export declare function isUnionTypeDefinitionString(str: string): boolean;
export declare function isSomeOutputTypeComposer(type: any): type is ComposeOutputType<any>;
export declare function isSomeInputTypeComposer(type: any): type is ComposeInputType;
export declare function isComposeNamedType(type: any): type is NamedTypeComposer<any> | GraphQLNamedType;
export declare function isComposeType(type: any): type is AnyTypeComposer<any>;
export declare function isComposeOutputType(type: any): type is ComposeOutputTypeDefinition<any>;
export declare function isComposeInputType(type: any): type is ComposeInputTypeDefinition;
export type AnyType<TContext> = NamedTypeComposer<TContext> | GraphQLNamedType;
export declare function isNamedTypeComposer(type: any): type is NamedTypeComposer<any>;
export declare function isTypeComposer(type: any): type is AnyTypeComposer<any>;
export declare function getGraphQLType(anyType: any): GraphQLType;
export declare function getComposeTypeName(type: any, sc: SchemaComposer<any>): string;
export declare function unwrapTC<TContext>(anyTC: AnyTypeComposer<TContext>): NamedTypeComposer<TContext>;
export declare function unwrapInputTC(inputTC: ComposeInputType): ComposeNamedInputType<any>;
export declare function unwrapOutputTC<TContext>(outputTC: ComposeOutputType<TContext>): ComposeNamedOutputType<TContext>;
export declare function changeUnwrappedTC<TContext, T>(anyTC: T, cb: (tc: NamedTypeComposer<TContext>) => NamedTypeComposer<TContext>): T;
export declare function replaceTC<T>(anyTC: T, replaceByTC: Readonly<NamedTypeComposer<any>> | ((unwrappedTC: NamedTypeComposer<any>) => NamedTypeComposer<any>)): T;
export declare function unwrapTypeNameString(str: string): string;
export declare function cloneTypeTo(type: AnyTypeComposer<any> | TypeAsString | GraphQLType, anotherSchemaComposer: SchemaComposer<any>, cloneMap?: Map<any, any>): AnyTypeComposer<any> | TypeAsString;