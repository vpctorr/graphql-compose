import { isType, isNamedType, parse, isOutputType, isInputType } from 'graphql';
import { isFunction } from './is';
import { inspect } from './misc';
import { dedent } from './dedent';
import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { UnionTypeComposer } from '../UnionTypeComposer';
import { Resolver } from '../Resolver';
import { NonNullComposer } from '../NonNullComposer';
import { ListComposer } from '../ListComposer';
import { ThunkComposer } from '../ThunkComposer';
import deprecate from './deprecate';
export function isTypeNameString(str) {
    return /^[_A-Za-z][_0-9A-Za-z]*$/.test(str);
}
export function isWrappedTypeNameString(str) {
    return isTypeNameString(unwrapTypeNameString(str));
}
export function isTypeDefinitionString(str) {
    return (isOutputTypeDefinitionString(str) ||
        isInputTypeDefinitionString(str) ||
        isEnumTypeDefinitionString(str) ||
        isScalarTypeDefinitionString(str) ||
        isInterfaceTypeDefinitionString(str) ||
        isUnionTypeDefinitionString(str));
}
export function isSomeOutputTypeDefinitionString(str) {
    return (isOutputTypeDefinitionString(str) ||
        isEnumTypeDefinitionString(str) ||
        isScalarTypeDefinitionString(str) ||
        isInterfaceTypeDefinitionString(str) ||
        isUnionTypeDefinitionString(str));
}
export function isSomeInputTypeDefinitionString(str) {
    return (isInputTypeDefinitionString(str) ||
        isEnumTypeDefinitionString(str) ||
        isScalarTypeDefinitionString(str));
}
export function isOutputTypeDefinitionString(str) {
    return /type\s[^{]+\{[^}]+\}/im.test(str);
}
export function isInputTypeDefinitionString(str) {
    return /input\s[^{]+\{[^}]+\}/im.test(str);
}
export function isEnumTypeDefinitionString(str) {
    return /enum\s[^{]+\{[^}]+\}/im.test(str);
}
export function isScalarTypeDefinitionString(str) {
    return /scalar\s/im.test(str);
}
export function isInterfaceTypeDefinitionString(str) {
    return /interface\s/im.test(str);
}
export function isUnionTypeDefinitionString(str) {
    return /union\s/im.test(str);
}
export function isSomeOutputTypeComposer(type) {
    return (type instanceof ObjectTypeComposer ||
        type instanceof InterfaceTypeComposer ||
        type instanceof EnumTypeComposer ||
        type instanceof UnionTypeComposer ||
        type instanceof ScalarTypeComposer ||
        (type instanceof NonNullComposer && isSomeOutputTypeComposer(type.ofType)) ||
        (type instanceof ListComposer && isSomeOutputTypeComposer(type.ofType)) ||
        type instanceof ThunkComposer);
}
export function isSomeInputTypeComposer(type) {
    return (type instanceof InputTypeComposer ||
        type instanceof EnumTypeComposer ||
        type instanceof ScalarTypeComposer ||
        (type instanceof NonNullComposer && isSomeInputTypeComposer(type.ofType)) ||
        (type instanceof ListComposer && isSomeInputTypeComposer(type.ofType)) ||
        type instanceof ThunkComposer);
}
export function isComposeNamedType(type) {
    return (isNamedType(type) ||
        type instanceof ObjectTypeComposer ||
        type instanceof InputTypeComposer ||
        type instanceof InterfaceTypeComposer ||
        type instanceof EnumTypeComposer ||
        type instanceof UnionTypeComposer ||
        type instanceof ScalarTypeComposer);
}
export function isComposeType(type) {
    return (isComposeNamedType(type) ||
        (Array.isArray(type) && isComposeType(type[0])) ||
        type instanceof NonNullComposer ||
        type instanceof ListComposer ||
        type instanceof ThunkComposer ||
        type instanceof Resolver ||
        isType(type));
}
export function isComposeOutputType(type) {
    return (isOutputType(type) ||
        (Array.isArray(type) && isComposeOutputType(type[0])) ||
        isSomeOutputTypeComposer(type) ||
        type instanceof Resolver);
}
export function isComposeInputType(type) {
    return (isInputType(type) ||
        (Array.isArray(type) && isComposeInputType(type[0])) ||
        isSomeInputTypeComposer(type));
}
export function isNamedTypeComposer(type) {
    return (type instanceof ObjectTypeComposer ||
        type instanceof InputTypeComposer ||
        type instanceof ScalarTypeComposer ||
        type instanceof EnumTypeComposer ||
        type instanceof InterfaceTypeComposer ||
        type instanceof UnionTypeComposer);
}
export function isTypeComposer(type) {
    return (isNamedTypeComposer(type) ||
        type instanceof ListComposer ||
        type instanceof NonNullComposer ||
        type instanceof ThunkComposer);
}
export function getGraphQLType(anyType) {
    let type = anyType;
    if (type && isFunction(type.getType)) {
        type = type.getType();
    }
    if (!isType(type)) {
        throw new Error(`You provide incorrect type for 'getGraphQLType' method: ${inspect(type)}`);
    }
    return type;
}
export function getComposeTypeName(type, sc) {
    if (typeof type === 'string') {
        if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(type)) {
            return type;
        }
        else {
            const docNode = parse(type);
            if (docNode.definitions[0] &&
                docNode.definitions[0].name &&
                typeof docNode.definitions[0].name.value === 'string') {
                return docNode.definitions[0].name.value;
            }
        }
        throw new Error(`Cannot get type name from string: ${inspect(type)}`);
    }
    else if (isFunction(type)) {
        return getComposeTypeName(type(sc), sc);
    }
    else if (isNamedTypeComposer(type)) {
        return type.getTypeName();
    }
    else {
        try {
            const gqlType = getGraphQLType(type);
            if (typeof gqlType.name === 'string') {
                return gqlType.name;
            }
        }
        catch (e) {
            throw new Error(`Cannot get type name from ${inspect(type)}`);
        }
    }
    throw new Error(`Cannot get type name from ${inspect(type)}`);
}
export function unwrapTC(anyTC) {
    if (anyTC instanceof NonNullComposer ||
        anyTC instanceof ListComposer ||
        anyTC instanceof ThunkComposer) {
        const unwrappedTC = anyTC.getUnwrappedTC();
        return unwrapTC(unwrappedTC);
    }
    return anyTC;
}
export function unwrapInputTC(inputTC) {
    return unwrapTC(inputTC);
}
export function unwrapOutputTC(outputTC) {
    return unwrapTC(outputTC);
}
export function changeUnwrappedTC(anyTC, cb) {
    deprecate('Please use `replaceTC()` function instead.');
    return replaceTC(anyTC, cb);
}
export function replaceTC(anyTC, replaceByTC) {
    let tc = anyTC;
    const wrappers = [];
    while (tc instanceof ListComposer ||
        tc instanceof NonNullComposer ||
        tc instanceof ThunkComposer) {
        if (tc instanceof ThunkComposer) {
            tc = tc.getUnwrappedTC();
        }
        else {
            wrappers.unshift(tc.constructor);
            tc = tc.ofType;
        }
    }
    tc = isFunction(replaceByTC) ? replaceByTC(tc) : replaceByTC;
    if (tc) {
        tc = wrappers.reduce((type, Wrapper) => new Wrapper(type), tc);
    }
    return tc;
}
export function unwrapTypeNameString(str) {
    if (str.endsWith('!')) {
        return unwrapTypeNameString(str.slice(0, -1));
    }
    else if (str.startsWith('[') && str.endsWith(']')) {
        return unwrapTypeNameString(str.slice(1, -1));
    }
    return str;
}
export function cloneTypeTo(type, anotherSchemaComposer, cloneMap = new Map()) {
    if (cloneMap.has(type)) {
        return cloneMap.get(type);
    }
    else if (typeof type === 'string') {
        return type;
    }
    else if (isComposeType(type)) {
        if (Array.isArray(type))
            return type[0].cloneTo(anotherSchemaComposer, cloneMap);
        else
            return type.cloneTo(anotherSchemaComposer, cloneMap);
    }
    else if (isType(type)) {
        const tc = anotherSchemaComposer.typeMapper.convertGraphQLTypeToComposer(type);
        cloneMap.set(type, tc);
        return tc;
    }
    else {
        throw new Error(dedent `
      Something strange was provided to utils cloneTypeTo() method:
        ${inspect(type)}
    `);
    }
}
