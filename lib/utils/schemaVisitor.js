import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { UnionTypeComposer } from '../UnionTypeComposer';
import { isNamedTypeComposer } from './typeHelpers';
export function getVisitKinds(tc, schema) {
    let kinds = [];
    if (tc instanceof ObjectTypeComposer) {
        kinds = ['OBJECT_TYPE', 'COMPOSITE_TYPE', 'TYPE'];
        if (schema.Query === tc)
            kinds.unshift('QUERY', 'ROOT_OBJECT');
        if (schema.Mutation === tc)
            kinds.unshift('MUTATION', 'ROOT_OBJECT');
        if (schema.Subscription === tc)
            kinds.unshift('SUBSCRIPTION', 'ROOT_OBJECT');
    }
    else if (tc instanceof InputTypeComposer) {
        kinds = ['INPUT_OBJECT_TYPE', 'TYPE'];
    }
    else if (tc instanceof InterfaceTypeComposer) {
        kinds = ['INTERFACE_TYPE', 'ABSTRACT_TYPE', 'COMPOSITE_TYPE', 'TYPE'];
    }
    else if (tc instanceof UnionTypeComposer) {
        kinds = ['UNION_TYPE', 'ABSTRACT_TYPE', 'COMPOSITE_TYPE', 'TYPE'];
    }
    else if (tc instanceof ScalarTypeComposer) {
        kinds = ['SCALAR_TYPE', 'TYPE'];
    }
    else if (tc instanceof EnumTypeComposer) {
        kinds = ['ENUM_TYPE', 'TYPE'];
    }
    return kinds;
}
export function visitSchema(schema, visitor) {
    const visitedTCs = new WeakSet();
    schema.forEach((value, key) => {
        if (visitedTCs.has(value))
            return;
        visitedTCs.add(value);
        let tc = value;
        const visitKinds = getVisitKinds(tc, schema);
        for (const kind of visitKinds) {
            const visitorFn = visitor[kind];
            if (visitorFn) {
                const result = visitorFn(tc, schema);
                if (result === null) {
                    schema.delete(key);
                }
                else if (result === false) {
                    break;
                }
                else if (isNamedTypeComposer(result)) {
                    tc = result;
                    schema.set(key, tc);
                }
            }
        }
    });
}
export function isScalarTypeComposer(type) {
    return type instanceof ScalarTypeComposer;
}
export function isEnumTypeComposer(type) {
    return type instanceof EnumTypeComposer;
}
export function isObjectTypeComposer(type) {
    return type instanceof ObjectTypeComposer;
}
export function isInputTypeComposer(type) {
    return type instanceof InputTypeComposer;
}
export function isInterfaceTypeComposer(type) {
    return type instanceof InterfaceTypeComposer;
}
export function isUnionTypeComposer(type) {
    return type instanceof UnionTypeComposer;
}
