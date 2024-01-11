import { invariant, inspect } from './misc';
import { print } from 'graphql/language/printer';
import { printBlockString } from 'graphql/language/blockString';
import { isIntrospectionType } from 'graphql/type/introspection';
import { isSpecifiedScalarType } from 'graphql/type/scalars';
import { isSpecifiedDirective } from 'graphql/type/directives';
import { isScalarType, isObjectType, isInterfaceType, isUnionType, isEnumType, isInputObjectType, } from 'graphql/type/definition';
import { astFromValue } from 'graphql/utilities/astFromValue';
import { getTypesFromSchema, getDirectivesFromSchema } from './getFromSchema';
import { getSortMethodFromOption } from './schemaPrinterSortTypes';
import { graphqlVersion } from './graphqlVersion';
let printBlockStringLegacy;
if (graphqlVersion >= 16) {
    printBlockStringLegacy = printBlockString;
}
else {
    printBlockStringLegacy = (value, preferMultipleLines) => printBlockString(value, '', preferMultipleLines);
}
function splitOptionsFilterPrinter(options) {
    const { exclude = [], include, omitDirectiveDefinitions, ...optPrinter } = options || {};
    const optFilter = { exclude, include, omitDirectiveDefinitions };
    return { optPrinter, optFilter };
}
export function printSchemaComposer(sc, options) {
    const { optPrinter, optFilter } = splitOptionsFilterPrinter(options);
    const printTypes = Array.from(getTypesFromSchema(sc, optFilter));
    const sortMethod = getSortMethodFromOption(optPrinter?.sortTypes, optFilter);
    if (sortMethod)
        printTypes.sort(sortMethod);
    const res = [];
    if (!optFilter.omitDirectiveDefinitions) {
        res.push(...getDirectivesFromSchema(sc).map((d) => printDirective(d, optPrinter)));
    }
    res.push(...printTypes.map((tc) => tc.toSDL(optPrinter)));
    return res.filter(Boolean).join('\n\n');
}
export function printSchema(schema, options) {
    return printFilteredSchema(schema, (n) => !isSpecifiedDirective(n), isDefinedType, options);
}
export function printIntrospectionSchema(schema, options) {
    return printFilteredSchema(schema, isSpecifiedDirective, isIntrospectionType, options);
}
export function isDefinedType(type) {
    return !isSpecifiedScalarType(type) && !isIntrospectionType(type);
}
export function printFilteredSchema(schema, directiveFilter, typeFilter, options) {
    const directives = schema.getDirectives().filter(directiveFilter);
    const typeMap = schema.getTypeMap();
    const types = Object.values(typeMap)
        .sort((type1, type2) => type1.name.localeCompare(type2.name))
        .filter(typeFilter);
    return `${[printSchemaDefinition(schema)]
        .concat(directives.map((directive) => printDirective(directive, options)), types.map((type) => printType(type, options)))
        .filter(Boolean)
        .join('\n\n')}\n`;
}
export function printSchemaDefinition(schema) {
    if (isSchemaOfCommonNames(schema)) {
        return '';
    }
    const operationTypes = [];
    const queryType = schema.getQueryType();
    if (queryType) {
        operationTypes.push(`  query: ${queryType.name}`);
    }
    const mutationType = schema.getMutationType();
    if (mutationType) {
        operationTypes.push(`  mutation: ${mutationType.name}`);
    }
    const subscriptionType = schema.getSubscriptionType();
    if (subscriptionType) {
        operationTypes.push(`  subscription: ${subscriptionType.name}`);
    }
    return `schema {\n${operationTypes.join('\n')}\n}`;
}
export function isSchemaOfCommonNames(schema) {
    const queryType = schema.getQueryType();
    if (queryType && queryType.name !== 'Query') {
        return false;
    }
    const mutationType = schema.getMutationType();
    if (mutationType && mutationType.name !== 'Mutation') {
        return false;
    }
    const subscriptionType = schema.getSubscriptionType();
    if (subscriptionType && subscriptionType.name !== 'Subscription') {
        return false;
    }
    return true;
}
export function printType(type, options) {
    if (isScalarType(type)) {
        return printScalar(type, options);
    }
    else if (isObjectType(type)) {
        return printObject(type, options);
    }
    else if (isInterfaceType(type)) {
        return printInterface(type, options);
    }
    else if (isUnionType(type)) {
        return printUnion(type, options);
    }
    else if (isEnumType(type)) {
        return printEnum(type, options);
    }
    else if (isInputObjectType(type)) {
        return printInputObject(type, options);
    }
    invariant(false, `Unexpected type: ${inspect(type)}`);
    return '';
}
export function printScalar(type, options) {
    if (options?.omitScalars)
        return '';
    return `${printDescription(type, options)}scalar ${type.name}${printNodeDirectives(type.astNode)}`;
}
export function printImplementedInterfaces(type, options) {
    const interfaces = (type.getInterfaces ? type.getInterfaces() : []);
    if (!interfaces.length)
        return '';
    if (options?.sortAll || options?.sortInterfaces) {
        return ` implements ${interfaces
            .map((i) => i.name)
            .sort()
            .join(' & ')}`;
    }
    return ` implements ${interfaces.map((i) => i.name).join(' & ')}`;
}
export function printObject(type, options) {
    return `${printDescription(type, options)}type ${type.name}${printImplementedInterfaces(type, options)}${printNodeDirectives(type.astNode)}${printFields(type, options)}`;
}
export function printInterface(type, options) {
    return `${printDescription(type, options)}interface ${type.name}${printImplementedInterfaces(type, options)}${printNodeDirectives(type.astNode)}${printFields(type, options)}`;
}
export function printUnion(type, options) {
    let types = type.getTypes();
    if (options?.sortAll || options?.sortUnions) {
        types = [...types].sort();
    }
    const possibleTypes = types.length ? ` = ${types.join(' | ')}` : '';
    return `${printDescription(type, options)}union ${type.name}${printNodeDirectives(type.astNode)}${possibleTypes}`;
}
export function printEnum(type, options) {
    let values = type.getValues();
    if (options?.sortAll || options?.sortEnums) {
        values = [...values].sort((a, b) => a.name.localeCompare(b.name));
    }
    const valuesList = values.map((value, i) => `${printDescription(value, options, '  ', !i)}  ${value.name}${printNodeDirectives(value.astNode)}`);
    return `${printDescription(type, options)}enum ${type.name}${printNodeDirectives(type.astNode)}${printBlock(valuesList)}`;
}
export function printInputObject(type, options) {
    let fields = Object.values(type.getFields());
    if (options?.sortAll || options?.sortFields) {
        fields = fields.sort((a, b) => a.name.localeCompare(b.name));
    }
    const fieldsList = fields.map((f, i) => `${printDescription(f, options, '  ', !i)}  ${printInputValue(f)}`);
    return `${printDescription(type, options)}input ${type.name}${printNodeDirectives(type.astNode)}${printBlock(fieldsList)}`;
}
export function printFields(type, options) {
    let fields = Object.values(type.getFields());
    if (options?.sortAll || options?.sortFields) {
        fields = fields.sort((a, b) => a.name.localeCompare(b.name));
    }
    const fieldsList = fields.map((f, i) => `${printDescription(f, options, '  ', !i)}  ${f.name}${printArgs(f.args, options, '  ')}: ${String(f.type)}${printNodeDirectives(f.astNode)}`);
    return printBlock(fieldsList);
}
export function printBlock(items) {
    return items.length !== 0 ? ` {\n${items.join('\n')}\n}` : '';
}
export function printArgs(_args, options, indentation = '') {
    if (_args.length === 0) {
        return '';
    }
    const args = options?.sortAll || options?.sortArgs
        ? [..._args].sort((a, b) => a.name.localeCompare(b.name))
        : _args;
    if (args.every((arg) => !arg.description)) {
        return `(${args.map(printInputValue).join(', ')})`;
    }
    return `(\n${args
        .map((arg, i) => `${printDescription(arg, options, `  ${indentation}`, !i)}  ${indentation}${printInputValue(arg)}`)
        .join('\n')}\n${indentation})`;
}
export function printInputValue(arg) {
    const defaultAST = astFromValue(arg.defaultValue, arg.type);
    let argDecl = `${arg.name}: ${String(arg.type)}`;
    if (defaultAST) {
        argDecl += ` = ${print(defaultAST)}`;
    }
    return `${argDecl}${printNodeDirectives(arg.astNode)}`;
}
export function printDirective(directive, options) {
    return `${printDescription(directive, options)}directive @${directive.name}${printArgs(directive.args, options)}${directive.isRepeatable ? ' repeatable' : ''} on ${directive.locations.join(' | ')}`;
}
export function printNodeDirectives(node) {
    if (!node || !node.directives || !node.directives.length)
        return '';
    return ` ${node.directives
        .map((d) => {
        let args = '';
        if (d.arguments && d.arguments.length) {
            args = `(${d.arguments.map((a) => `${a.name.value}: ${print(a.value)}`).join(', ')})`;
        }
        return `@${d.name.value}${args}`;
    })
        .join(' ')}`;
}
export function printDescription(def, options, indentation = '', firstInBlock = true) {
    let { description } = def;
    if (description == null || options?.omitDescriptions) {
        return '';
    }
    description = description.trimRight();
    if (options && options.commentDescriptions) {
        return printDescriptionWithComments(description, indentation, firstInBlock);
    }
    const preferMultipleLines = description.length > 70;
    const blockString = printBlockStringLegacy(description, preferMultipleLines);
    const prefix = indentation && !firstInBlock ? `\n${indentation}` : indentation;
    return `${prefix + blockString.replace(/\n/g, `\n${indentation}`)}\n`;
}
export function printDescriptionWithComments(description, indentation, firstInBlock) {
    const prefix = indentation && !firstInBlock ? '\n' : '';
    const comment = description
        .split('\n')
        .map((line) => indentation + (line !== '' ? `# ${line}` : '#'))
        .join('\n');
    return `${prefix + comment}\n`;
}
