import { astFromValue } from 'graphql';
import { ThunkComposer } from '../ThunkComposer';
import { NonNullComposer } from '../NonNullComposer';
import { ListComposer } from '../ListComposer';
import { inspect } from './misc';
import { Kind } from 'graphql';
export function getObjectTypeDefinitionNode(tc) {
    return {
        kind: Kind.OBJECT_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        description: getDescriptionNode(tc.getDescription()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
        interfaces: getInterfaceNodes(tc.getInterfaces()),
        fields: getFieldDefinitionNodes(tc),
    };
}
export function getInputObjectTypeDefinitionNode(tc) {
    return {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
        description: getDescriptionNode(tc.getDescription()),
        fields: getInputValueDefinitionNodes(tc),
    };
}
export function getEnumTypeDefinitionNode(tc) {
    return {
        kind: Kind.ENUM_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        description: getDescriptionNode(tc.getDescription()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
        values: getEnumValueDefinitionNodes(tc) || [],
    };
}
export function getInterfaceTypeDefinitionNode(tc) {
    return {
        kind: Kind.INTERFACE_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        description: getDescriptionNode(tc.getDescription()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
        fields: getFieldDefinitionNodes(tc),
    };
}
export function getScalarTypeDefinitionNode(tc) {
    return {
        kind: Kind.SCALAR_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        description: getDescriptionNode(tc.getDescription()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
    };
}
export function getUnionTypeDefinitionNode(tc) {
    return {
        kind: Kind.UNION_TYPE_DEFINITION,
        name: getNameNode(tc.getTypeName()),
        description: getDescriptionNode(tc.getDescription()),
        directives: getDirectiveNodes(tc.getDirectives(), tc.schemaComposer),
        types: tc.getTypeNames().map((value) => ({
            kind: Kind.NAMED_TYPE,
            name: getNameNode(value),
        })),
    };
}
export function getDescriptionNode(value) {
    if (!value)
        return;
    return {
        kind: Kind.STRING,
        value,
    };
}
function toValueNode(value) {
    switch (typeof value) {
        case 'string':
            return { kind: Kind.STRING, value };
        case 'number':
            if (Number.isInteger(value))
                return { kind: Kind.INT, value: value.toString() };
            return { kind: Kind.FLOAT, value: value.toString() };
        case 'boolean':
            return { kind: Kind.BOOLEAN, value };
        case 'object':
            if (value === null) {
                return { kind: Kind.NULL };
            }
            else if (Array.isArray(value)) {
                return {
                    kind: Kind.LIST,
                    values: value.map((v) => toValueNode(v)),
                };
            }
            else {
                return {
                    kind: Kind.OBJECT,
                    fields: Object.keys(value).map((k) => ({
                        kind: Kind.OBJECT_FIELD,
                        name: getNameNode(k),
                        value: toValueNode(value[k]),
                    })),
                };
            }
        default:
            console.log(`Cannot determine astNode in toValueNode() method: ${inspect(value)}`);
            return { kind: Kind.NULL };
    }
}
function getDirectiveArgumentNodes(data, directive) {
    const keys = Object.keys(data);
    if (!keys.length)
        return;
    const args = [];
    keys.forEach((k) => {
        let argumentType;
        if (directive) {
            argumentType = directive.args.find((d) => d.name === k)?.type;
        }
        const argNode = {
            kind: Kind.ARGUMENT,
            name: getNameNode(k),
            value: argumentType
                ?
                    astFromValue(data[k], argumentType) || { kind: Kind.NULL }
                :
                    toValueNode(data[k]),
        };
        args.push(argNode);
    });
    return args;
}
export function getDirectiveNodes(values, sc) {
    if (!values || !values.length)
        return;
    return values.map((v) => ({
        kind: Kind.DIRECTIVE,
        name: getNameNode(v.name),
        arguments: v.args && getDirectiveArgumentNodes(v.args, sc._getDirective(v.name)),
    }));
}
export function getInterfaceNodes(ifaces) {
    return ifaces
        .map((iface) => {
        if (!iface || !iface.getTypeName)
            return;
        return {
            kind: Kind.NAMED_TYPE,
            name: getNameNode(iface.getTypeName()),
        };
    })
        .filter(Boolean);
}
export function getTypeNode(atc) {
    if (atc instanceof ThunkComposer) {
        return getTypeNode(atc.ofType);
    }
    else if (atc instanceof ListComposer) {
        const subType = getTypeNode(atc.ofType);
        if (!subType)
            return;
        return {
            kind: Kind.LIST_TYPE,
            type: subType,
        };
    }
    else if (atc instanceof NonNullComposer) {
        const subType = getTypeNode(atc.ofType);
        if (!subType)
            return;
        return {
            kind: Kind.NON_NULL_TYPE,
            type: subType,
        };
    }
    else if (atc && atc.getTypeName) {
        return {
            kind: Kind.NAMED_TYPE,
            name: getNameNode(atc.getTypeName()),
        };
    }
    return undefined;
}
export function getArgumentsDefinitionNodes(tc, fieldName) {
    const argNames = tc.getFieldArgNames(fieldName);
    if (!argNames.length)
        return;
    return argNames
        .map((argName) => {
        const ac = tc.getFieldArg(fieldName, argName);
        const type = getTypeNode(ac.type);
        if (!type)
            return;
        return {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: getNameNode(argName),
            type,
            description: getDescriptionNode(ac.description),
            directives: getDirectiveNodes(tc.getFieldArgDirectives(fieldName, argName), tc.schemaComposer),
            defaultValue: (ac.defaultValue !== undefined &&
                astFromValue(ac.defaultValue, tc.getFieldArgType(fieldName, argName))) ||
                undefined,
        };
    })
        .filter(Boolean);
}
export function getFieldDefinitionNodes(tc) {
    const fieldNames = tc.getFieldNames();
    if (!fieldNames.length)
        return;
    return fieldNames
        .map((fieldName) => {
        const fc = tc.getField(fieldName);
        const type = getTypeNode(fc.type);
        if (!type)
            return;
        return {
            kind: Kind.FIELD_DEFINITION,
            name: getNameNode(fieldName),
            type,
            arguments: getArgumentsDefinitionNodes(tc, fieldName),
            description: getDescriptionNode(fc.description),
            directives: getDirectiveNodes(tc.getFieldDirectives(fieldName), tc.schemaComposer),
        };
    })
        .filter(Boolean);
}
export function getInputValueDefinitionNodes(tc) {
    const fieldNames = tc.getFieldNames();
    if (!fieldNames.length)
        return;
    return fieldNames
        .map((fieldName) => {
        const fc = tc.getField(fieldName);
        const type = getTypeNode(fc.type);
        if (!type)
            return;
        return {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: getNameNode(fieldName),
            type,
            description: getDescriptionNode(fc.description),
            directives: getDirectiveNodes(tc.getFieldDirectives(fieldName), tc.schemaComposer),
            defaultValue: (fc.defaultValue !== undefined &&
                astFromValue(fc.defaultValue, tc.getFieldType(fieldName))) ||
                undefined,
        };
    })
        .filter(Boolean);
}
export function getNameNode(value) {
    return { kind: Kind.NAME, value };
}
export function getEnumValueDefinitionNodes(tc) {
    const fieldNames = tc.getFieldNames();
    if (!fieldNames.length)
        return;
    return fieldNames.map((fieldName) => {
        const fc = tc.getField(fieldName);
        return {
            kind: Kind.ENUM_VALUE_DEFINITION,
            name: getNameNode(fieldName),
            description: getDescriptionNode(fc.description),
            directives: getDirectiveNodes(tc.getFieldDirectives(fieldName), tc.schemaComposer),
        };
    });
}
export function parseValueNode(ast, variables = {}, typeName) {
    switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
            return parseFloat(ast.value);
        case Kind.OBJECT:
            const value = Object.create(null);
            ast.fields.forEach((field) => {
                value[field.name.value] = parseValueNode(field.value, variables, typeName);
            });
            return value;
        case Kind.LIST:
            return ast.values.map((n) => parseValueNode(n, variables, typeName));
        case Kind.NULL:
            return null;
        case Kind.VARIABLE:
            return variables ? variables[ast.name.value] : undefined;
        default:
            throw new TypeError(`${typeName} cannot represent value: ${inspect(ast)}`);
    }
}
