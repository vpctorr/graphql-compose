import { ObjectTypeComposer } from '../ObjectTypeComposer';
import { NonNullComposer } from '../NonNullComposer';
import { ListComposer } from '../ListComposer';
import { ThunkComposer } from '../ThunkComposer';
import { InterfaceTypeComposer } from '../InterfaceTypeComposer';
import { isSomeInputTypeComposer, } from './typeHelpers';
import { inspect } from './misc';
import { UnionTypeComposer } from '../UnionTypeComposer';
export function toInputType(anyTC, opts) {
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
    if (!isSomeInputTypeComposer(tc)) {
        if (tc instanceof ObjectTypeComposer || tc instanceof InterfaceTypeComposer) {
            tc = toInputObjectType(tc, opts);
        }
        else {
            if (opts?.fallbackType)
                return opts.fallbackType;
            if (tc instanceof UnionTypeComposer) {
                throw new Error(`Cannot convert UnionTypeComposer(${tc.getTypeName()}) to Input type. Please use 'fallbackType' option for removing this error.`);
            }
            else {
                throw new Error(`Cannot convert '${inspect(tc)}' to InputType. Please use 'fallbackType' option for removing this error.`);
            }
        }
    }
    if (tc) {
        tc = wrappers.reduce((type, Wrapper) => new Wrapper(type), tc);
    }
    return tc;
}
export function toInputObjectType(tc, opts) {
    if (tc.hasInputTypeComposer()) {
        return tc.getInputTypeComposer();
    }
    const prefix = opts?.prefix || '';
    const postfix = opts?.postfix || 'Input';
    const inputTypeName = `${prefix}${tc.getTypeName()}${postfix}`;
    const inputTypeComposer = tc.schemaComposer.createInputTC(inputTypeName);
    tc.setInputTypeComposer(inputTypeComposer);
    const fieldNames = tc.getFieldNames();
    fieldNames.forEach((fieldName) => {
        const fc = tc.getField(fieldName);
        let fieldInputType;
        try {
            fieldInputType = toInputType(fc.type, opts);
        }
        catch (e) {
            if (opts?.fallbackType || opts?.fallbackType === null) {
                fieldInputType = opts?.fallbackType;
            }
            else {
                throw new Error(`${`Can not convert field '${tc.getTypeName()}.${fieldName}' to InputType` +
                    '\nIt should be ObjectType or InterfaceType, but got \n'}${inspect(fc.type)}`);
            }
        }
        if (fieldInputType) {
            inputTypeComposer.setField(fieldName, {
                type: fieldInputType,
                description: fc.description,
            });
        }
    });
    return inputTypeComposer;
}
export function convertInputObjectField(field, opts) {
    return toInputType(field, opts);
}
