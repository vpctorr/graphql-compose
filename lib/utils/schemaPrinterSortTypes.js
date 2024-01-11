import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { InputTypeComposer } from '../InputTypeComposer';
import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { UnionTypeComposer } from '../UnionTypeComposer';
import { isFunction } from './is';
const rootOrderDefault = ['Query', 'Mutation', 'Subscription'];
export function printSortAlpha(tc1, tc2) {
    const comp = tc1.getTypeName().localeCompare(tc2.getTypeName());
    return comp;
}
function sortGetPositionOfType(tc, rootTypes = []) {
    switch (true) {
        case tc instanceof ScalarTypeComposer:
            return [2];
        case tc instanceof EnumTypeComposer:
            return [3];
        case tc instanceof UnionTypeComposer:
            return [4];
        case tc instanceof InterfaceTypeComposer:
            return [5];
        case tc instanceof ObjectTypeComposer:
            const rootPos = rootTypes.indexOf(tc.getTypeName());
            if (rootPos !== -1) {
                return [1, rootPos];
            }
            else {
                return [6];
            }
        case tc instanceof InputTypeComposer:
            return [7];
    }
    throw new Error(`Unknown kind of type ${tc.getTypeName()}`);
}
function comparePositionLists(p1, p2) {
    const common = Math.min(p1.length, p2.length);
    for (let i = 0; i < common; i++) {
        if (p1[i] < p2[i])
            return -1;
        if (p1[i] > p2[i])
            return +1;
    }
    return 0;
}
export function fnPrintSortByType(opt) {
    const rootTypes = opt?.include || rootOrderDefault;
    return function (tc1, tc2) {
        const pos1 = sortGetPositionOfType(tc1, rootTypes);
        const pos2 = sortGetPositionOfType(tc2, rootTypes);
        const diff = comparePositionLists(pos1, pos2);
        return diff || printSortAlpha(tc1, tc2);
    };
}
export function getSortMethodFromOption(sortOption, printFilter) {
    if (sortOption === undefined ||
        sortOption === null ||
        sortOption === true ||
        sortOption === 'ALPHABETIC') {
        return printSortAlpha;
    }
    else if (sortOption === 'GROUP_BY_TYPE') {
        return fnPrintSortByType(printFilter);
    }
    else if (isFunction(sortOption)) {
        return sortOption;
    }
    return;
}
