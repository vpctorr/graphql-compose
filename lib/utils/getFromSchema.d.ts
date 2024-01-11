import { SchemaComposer } from '../SchemaComposer';
import type { NamedTypeComposer } from './typeHelpers';
export type SchemaFilterTypes = {
    include?: string[];
    exclude?: string[];
    omitDirectiveDefinitions?: boolean;
};
export declare function getTypesFromSchema(sc: SchemaComposer<any>, filter?: SchemaFilterTypes): Set<NamedTypeComposer<any>>;
export declare function getDirectivesFromSchema(sc: SchemaComposer<any>): any[];
