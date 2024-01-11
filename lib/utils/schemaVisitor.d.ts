import type { SchemaComposer } from '../SchemaComposer';
import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { UnionTypeComposer } from '../UnionTypeComposer';
import { NamedTypeComposer } from './typeHelpers';
export type VisitorEmptyResult = void | null | false;
export type VisitKindFn<T, TContext> = (tc: T, schemaComposer: SchemaComposer<TContext>) => VisitorEmptyResult | NamedTypeComposer<TContext>;
export type SchemaVisitor<TContext> = {
    TYPE?: VisitKindFn<NamedTypeComposer<TContext>, TContext>;
    SCALAR_TYPE?: VisitKindFn<ScalarTypeComposer<TContext>, TContext>;
    ENUM_TYPE?: VisitKindFn<EnumTypeComposer<TContext>, TContext>;
    COMPOSITE_TYPE?: VisitKindFn<ObjectTypeComposer<any, TContext> | InterfaceTypeComposer<any, TContext> | UnionTypeComposer<any, TContext>, TContext>;
    OBJECT_TYPE?: VisitKindFn<ObjectTypeComposer<any, TContext>, TContext>;
    INPUT_OBJECT_TYPE?: VisitKindFn<InputTypeComposer<TContext>, TContext>;
    ABSTRACT_TYPE?: VisitKindFn<InterfaceTypeComposer<any, TContext> | UnionTypeComposer<any, TContext>, TContext>;
    UNION_TYPE?: VisitKindFn<UnionTypeComposer<any, TContext>, TContext>;
    INTERFACE_TYPE?: VisitKindFn<InterfaceTypeComposer<any, TContext>, TContext>;
    ROOT_OBJECT?: VisitKindFn<ObjectTypeComposer<any, TContext>, TContext>;
    QUERY?: VisitKindFn<ObjectTypeComposer<any, TContext>, TContext>;
    MUTATION?: VisitKindFn<ObjectTypeComposer<any, TContext>, TContext>;
    SUBSCRIPTION?: VisitKindFn<ObjectTypeComposer<any, TContext>, TContext>;
};
export type VisitSchemaKind = 'TYPE' | 'SCALAR_TYPE' | 'ENUM_TYPE' | 'COMPOSITE_TYPE' | 'OBJECT_TYPE' | 'INPUT_OBJECT_TYPE' | 'ABSTRACT_TYPE' | 'UNION_TYPE' | 'INTERFACE_TYPE' | 'ROOT_OBJECT' | 'QUERY' | 'MUTATION' | 'SUBSCRIPTION';
export declare function getVisitKinds(tc: NamedTypeComposer<any>, schema: SchemaComposer<any>): VisitSchemaKind[];
export declare function visitSchema<TContext>(schema: SchemaComposer<TContext>, visitor: SchemaVisitor<TContext>): void;
export declare function isScalarTypeComposer(type: NamedTypeComposer<any>): type is ScalarTypeComposer;
export declare function isEnumTypeComposer(type: NamedTypeComposer<any>): type is EnumTypeComposer;
export declare function isObjectTypeComposer(type: NamedTypeComposer<any>): type is ObjectTypeComposer;
export declare function isInputTypeComposer(type: NamedTypeComposer<any>): type is InputTypeComposer;
export declare function isInterfaceTypeComposer(type: NamedTypeComposer<any>): type is InterfaceTypeComposer;
export declare function isUnionTypeComposer(type: NamedTypeComposer<any>): type is UnionTypeComposer;