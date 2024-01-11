import { NamedTypeComposer } from './typeHelpers';
import { SchemaFilterTypes } from './getFromSchema';
export type CompareTypeComposersResult = -1 | 0 | 1;
export type CompareTypeComposersFn = (tc1: NamedTypeComposer<any>, tc2: NamedTypeComposer<any>) => CompareTypeComposersResult;
export type CompareTypeComposersOption = boolean | 'ALPHABETIC' | 'GROUP_BY_TYPE' | CompareTypeComposersFn;
export declare function printSortAlpha(tc1: NamedTypeComposer<any>, tc2: NamedTypeComposer<any>): CompareTypeComposersResult;
export declare function fnPrintSortByType(opt?: SchemaFilterTypes): CompareTypeComposersFn;
export declare function getSortMethodFromOption(sortOption?: CompareTypeComposersOption, printFilter?: SchemaFilterTypes): CompareTypeComposersFn | undefined;
