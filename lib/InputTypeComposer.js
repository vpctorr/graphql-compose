import { GraphQLInputObjectType } from 'graphql';
import { resolveMaybeThunk, upperFirst, inspect, mapEachKey } from './utils/misc';
import { isObject, isFunction, isString } from './utils/is';
import { typeByPath } from './utils/typeByPath';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { graphqlVersion } from './utils/graphqlVersion';
import { defineInputFieldMap, convertInputFieldMapToConfig } from './utils/configToDefine';
import { unwrapInputTC, isTypeNameString, cloneTypeTo, } from './utils/typeHelpers';
import { printInputObject } from './utils/schemaPrinter';
import { getInputObjectTypeDefinitionNode } from './utils/definitionNode';
import { getSortMethodFromOption } from './utils/schemaPrinterSortTypes';
export class InputTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `InputTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, InputTypeComposer)) {
            return schemaComposer.getITC(typeDef);
        }
        const itc = this.createTemp(typeDef, schemaComposer);
        schemaComposer.add(itc);
        return itc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let ITC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                ITC = new InputTypeComposer(new GraphQLInputObjectType({
                    name: typeName,
                    fields: () => ({}),
                }), sc);
            }
            else {
                ITC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(ITC instanceof InputTypeComposer)) {
                    throw new Error('You should provide correct GraphQLInputObjectType type definition. ' +
                        'Eg. `input MyInputType { name: String! }`');
                }
            }
        }
        else if (typeDef instanceof GraphQLInputObjectType) {
            ITC = new InputTypeComposer(typeDef, sc);
        }
        else if (isObject(typeDef)) {
            const type = new GraphQLInputObjectType({
                name: typeDef.name,
                description: typeDef.description,
                fields: () => ({}),
            });
            ITC = new InputTypeComposer(type, sc);
            const fields = typeDef.fields;
            if (isFunction(fields)) {
                ITC.addFields(convertInputFieldMapToConfig(fields, sc));
            }
            if (isObject(fields))
                ITC.addFields(fields);
            ITC.setExtensions(typeDef.extensions || undefined);
            if (Array.isArray(typeDef?.directives)) {
                ITC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide InputObjectConfig or string with type name to InputTypeComposer.create(typeDef). Provided:\n${inspect(typeDef)}`);
        }
        return ITC;
    }
    constructor(graphqlType, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new InputTypeComposer(GraphQLInputType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLInputObjectType)) {
            throw new Error('InputTypeComposer accept only GraphQLInputObjectType in constructor');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        this.schemaComposer.set(graphqlType.name, this);
        if (graphqlVersion >= 14) {
            this._gqcFields = convertInputFieldMapToConfig(this._gqType._fields, this.schemaComposer);
        }
        else {
            const fields = this._gqType._typeConfig.fields;
            this._gqcFields = this.schemaComposer.typeMapper.convertInputFieldConfigMap(resolveMaybeThunk(fields) || {}, this.getTypeName());
        }
        if (!this._gqType.astNode) {
            this._gqType.astNode = getInputObjectTypeDefinitionNode(this);
        }
        this._gqcIsModified = false;
    }
    getFields() {
        return this._gqcFields;
    }
    getFieldNames() {
        return Object.keys(this._gqcFields);
    }
    hasField(fieldName) {
        return !!this._gqcFields[fieldName];
    }
    setFields(fields) {
        this._gqcFields = {};
        Object.keys(fields).forEach((name) => {
            this.setField(name, fields[name]);
        });
        return this;
    }
    setField(fieldName, fieldConfig) {
        this._gqcFields[fieldName] = isFunction(fieldConfig)
            ? fieldConfig
            : this.schemaComposer.typeMapper.convertInputFieldConfig(fieldConfig, fieldName, this.getTypeName());
        this._gqcIsModified = true;
        return this;
    }
    addFields(newFields) {
        Object.keys(newFields).forEach((name) => {
            this.setField(name, newFields[name]);
        });
        return this;
    }
    addNestedFields(newFields) {
        Object.keys(newFields).forEach((fieldName) => {
            const fc = newFields[fieldName];
            const names = fieldName.split('.');
            const name = names.shift();
            if (!name) {
                throw new Error(`Type ${this.getTypeName()} has invalid field name: ${fieldName}`);
            }
            if (names.length === 0) {
                this.setField(name, fc);
            }
            else {
                let childTC;
                if (!this.hasField(name)) {
                    childTC = InputTypeComposer.create(`${this.getTypeName()}${upperFirst(name)}`, this.schemaComposer);
                    this.setField(name, childTC);
                }
                else {
                    childTC = this.getFieldTC(name);
                }
                if (childTC instanceof InputTypeComposer) {
                    childTC.addNestedFields({ [names.join('.')]: fc });
                }
            }
        });
        return this;
    }
    getField(fieldName) {
        if (isFunction(this._gqcFields[fieldName])) {
            const unwrappedFieldConfig = this._gqcFields[fieldName](this.schemaComposer);
            this.setField(fieldName, unwrappedFieldConfig);
        }
        const field = this._gqcFields[fieldName];
        if (!field) {
            throw new Error(`Cannot get field '${fieldName}' from input type '${this.getTypeName()}'. Field does not exist.`);
        }
        return field;
    }
    removeField(fieldNameOrArray) {
        const fieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        fieldNames.forEach((fieldName) => {
            const names = fieldName.split('.');
            const name = names.shift();
            if (!name)
                return;
            if (names.length === 0) {
                delete this._gqcFields[name];
                this._gqcIsModified = true;
            }
            else {
                if (this.hasField(name)) {
                    const subTC = this.getFieldTC(name);
                    if (subTC instanceof InputTypeComposer) {
                        subTC.removeField(names.join('.'));
                    }
                }
            }
        });
        return this;
    }
    removeOtherFields(fieldNameOrArray) {
        const keepFieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        Object.keys(this._gqcFields).forEach((fieldName) => {
            if (keepFieldNames.indexOf(fieldName) === -1) {
                delete this._gqcFields[fieldName];
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    extendField(fieldName, partialFieldConfig) {
        let prevFieldConfig;
        try {
            prevFieldConfig = this.getField(fieldName);
        }
        catch (e) {
            throw new Error(`Cannot extend field '${fieldName}' from input type '${this.getTypeName()}'. Field does not exist.`);
        }
        this.setField(fieldName, {
            ...prevFieldConfig,
            ...partialFieldConfig,
            extensions: {
                ...(prevFieldConfig.extensions || {}),
                ...(partialFieldConfig.extensions || {}),
            },
            directives: [...(prevFieldConfig.directives || []), ...(partialFieldConfig.directives || [])],
        });
        return this;
    }
    reorderFields(names) {
        const orderedFields = {};
        const fields = this._gqcFields;
        names.forEach((name) => {
            if (fields[name]) {
                orderedFields[name] = fields[name];
                delete fields[name];
            }
        });
        this._gqcFields = { ...orderedFields, ...fields };
        this._gqcIsModified = true;
        return this;
    }
    getFieldConfig(fieldName) {
        const { type, ...rest } = this.getField(fieldName);
        return {
            type: type.getType(),
            ...rest,
        };
    }
    getFieldType(fieldName) {
        return this.getField(fieldName).type.getType();
    }
    getFieldTypeName(fieldName) {
        return this.getField(fieldName).type.getTypeName();
    }
    getFieldTC(fieldName) {
        const anyTC = this.getField(fieldName).type;
        return unwrapInputTC(anyTC);
    }
    getFieldITC(fieldName) {
        const tc = this.getFieldTC(fieldName);
        if (!(tc instanceof InputTypeComposer)) {
            throw new Error(`${this.getTypeName()}.getFieldITC('${fieldName}') must be InputTypeComposer, but received ${tc.constructor.name}. Maybe you need to use 'getFieldTC()' method which returns any type composer?`);
        }
        return tc;
    }
    isRequired(fieldName) {
        return this.isFieldNonNull(fieldName);
    }
    isFieldNonNull(fieldName) {
        return this.getField(fieldName).type instanceof NonNullComposer;
    }
    makeFieldNonNull(fieldNameOrArray) {
        const fieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        fieldNames.forEach((fieldName) => {
            const fc = this._gqcFields[fieldName];
            if (fc && !(fc.type instanceof NonNullComposer)) {
                fc.type = new NonNullComposer(fc.type);
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    makeRequired(fieldNameOrArray) {
        return this.makeFieldNonNull(fieldNameOrArray);
    }
    makeFieldNullable(fieldNameOrArray) {
        const fieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        fieldNames.forEach((fieldName) => {
            const fc = this._gqcFields[fieldName];
            if (fc && fc.type instanceof NonNullComposer) {
                fc.type = fc.type.ofType;
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    makeOptional(fieldNameOrArray) {
        return this.makeFieldNullable(fieldNameOrArray);
    }
    isFieldPlural(fieldName) {
        const type = this.getField(fieldName).type;
        return (type instanceof ListComposer ||
            (type instanceof NonNullComposer && type.ofType instanceof ListComposer));
    }
    makeFieldPlural(fieldNameOrArray) {
        const fieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        fieldNames.forEach((fieldName) => {
            const fc = this._gqcFields[fieldName];
            if (fc && !(fc.type instanceof ListComposer)) {
                fc.type = new ListComposer(fc.type);
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    makeFieldNonPlural(fieldNameOrArray) {
        const fieldNames = Array.isArray(fieldNameOrArray) ? fieldNameOrArray : [fieldNameOrArray];
        fieldNames.forEach((fieldName) => {
            const fc = this._gqcFields[fieldName];
            if (fc) {
                if (fc.type instanceof ListComposer) {
                    fc.type = fc.type.ofType;
                    this._gqcIsModified = true;
                }
                else if (fc.type instanceof NonNullComposer && fc.type.ofType instanceof ListComposer) {
                    fc.type =
                        fc.type.ofType.ofType instanceof NonNullComposer
                            ? fc.type.ofType.ofType
                            : new NonNullComposer(fc.type.ofType.ofType);
                    this._gqcIsModified = true;
                }
            }
        });
        return this;
    }
    getType() {
        if (this._gqcIsModified) {
            this._gqcIsModified = false;
            this._gqType.astNode = getInputObjectTypeDefinitionNode(this);
            if (graphqlVersion >= 14) {
                this._gqType._fields = () => {
                    return defineInputFieldMap(this._gqType, mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name)), this._gqType.astNode);
                };
            }
            else {
                this._gqType._typeConfig.fields = () => {
                    return mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name));
                };
                delete this._gqType._fields;
            }
        }
        return this._gqType;
    }
    getTypePlural() {
        return new ListComposer(this);
    }
    getTypeNonNull() {
        return new NonNullComposer(this);
    }
    get List() {
        return new ListComposer(this);
    }
    get NonNull() {
        return new NonNullComposer(this);
    }
    getTypeName() {
        return this._gqType.name;
    }
    setTypeName(name) {
        this._gqType.name = name;
        this._gqcIsModified = true;
        this.schemaComposer.set(name, this);
        return this;
    }
    getDescription() {
        return this._gqType.description || '';
    }
    setDescription(description) {
        this._gqType.description = description;
        this._gqcIsModified = true;
        return this;
    }
    clone(newTypeNameOrTC) {
        if (!newTypeNameOrTC) {
            throw new Error('You should provide new type name for clone() method');
        }
        const cloned = newTypeNameOrTC instanceof InputTypeComposer
            ? newTypeNameOrTC
            : InputTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
        cloned._gqcFields = mapEachKey(this._gqcFields, (fieldConfig) => ({
            ...fieldConfig,
            extensions: { ...fieldConfig.extensions },
            directives: fieldConfig.directives && [...(fieldConfig.directives || [])],
        }));
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        return cloned;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        if (!anotherSchemaComposer) {
            throw new Error('You should provide SchemaComposer for InputTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return cloneMap.get(this);
        const cloned = InputTypeComposer.create(this.getTypeName(), anotherSchemaComposer);
        cloneMap.set(this, cloned);
        cloned._gqcFields = mapEachKey(this._gqcFields, (fieldConfig) => ({
            ...fieldConfig,
            type: cloneTypeTo(fieldConfig.type, anotherSchemaComposer, cloneMap),
            extensions: { ...fieldConfig.extensions },
        }));
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned.setDescription(this.getDescription());
        return cloned;
    }
    merge(type) {
        let tc;
        if (type instanceof GraphQLInputObjectType) {
            tc = InputTypeComposer.createTemp(type, this.schemaComposer);
        }
        else if (type instanceof InputTypeComposer) {
            tc = type;
        }
        else {
            throw new Error(`Cannot merge ${inspect(type)} with InputObjectType(${this.getTypeName()}). Provided type should be GraphQLInputObjectType or InputTypeComposer.`);
        }
        const fields = { ...tc.getFields() };
        Object.keys(fields).forEach((fieldName) => {
            fields[fieldName] = {
                ...fields[fieldName],
                type: tc.getFieldTypeName(fieldName),
            };
        });
        this.addFields(fields);
        return this;
    }
    getExtensions() {
        if (!this._gqcExtensions) {
            return {};
        }
        else {
            return this._gqcExtensions;
        }
    }
    setExtensions(extensions) {
        this._gqcExtensions = extensions || undefined;
        this._gqcIsModified = true;
        return this;
    }
    extendExtensions(extensions) {
        const current = this.getExtensions();
        this.setExtensions({
            ...current,
            ...extensions,
        });
        return this;
    }
    clearExtensions() {
        this.setExtensions({});
        return this;
    }
    getExtension(extensionName) {
        const extensions = this.getExtensions();
        return extensions[extensionName];
    }
    hasExtension(extensionName) {
        const extensions = this.getExtensions();
        return extensionName in extensions;
    }
    setExtension(extensionName, value) {
        this.extendExtensions({
            [extensionName]: value,
        });
        return this;
    }
    removeExtension(extensionName) {
        const extensions = { ...this.getExtensions() };
        delete extensions[extensionName];
        this.setExtensions(extensions);
        return this;
    }
    getFieldExtensions(fieldName) {
        const field = this.getField(fieldName);
        return field.extensions || {};
    }
    setFieldExtensions(fieldName, extensions) {
        const field = this.getField(fieldName);
        this.setField(fieldName, { ...field, extensions });
        return this;
    }
    extendFieldExtensions(fieldName, extensions) {
        const current = this.getFieldExtensions(fieldName);
        this.setFieldExtensions(fieldName, {
            ...current,
            ...extensions,
        });
        return this;
    }
    clearFieldExtensions(fieldName) {
        this.setFieldExtensions(fieldName, {});
        return this;
    }
    getFieldExtension(fieldName, extensionName) {
        const extensions = this.getFieldExtensions(fieldName);
        return extensions[extensionName];
    }
    hasFieldExtension(fieldName, extensionName) {
        const extensions = this.getFieldExtensions(fieldName);
        return extensionName in extensions;
    }
    setFieldExtension(fieldName, extensionName, value) {
        this.extendFieldExtensions(fieldName, {
            [extensionName]: value,
        });
        return this;
    }
    removeFieldExtension(fieldName, extensionName) {
        const extensions = { ...this.getFieldExtensions(fieldName) };
        delete extensions[extensionName];
        this.setFieldExtensions(fieldName, extensions);
        return this;
    }
    getDirectives() {
        return this._gqcDirectives || [];
    }
    setDirectives(directives) {
        this._gqcDirectives = directives;
        this._gqcIsModified = true;
        return this;
    }
    getDirectiveNames() {
        return this.getDirectives().map((d) => d.name);
    }
    getDirectiveByName(directiveName) {
        const directive = this.getDirectives().find((d) => d.name === directiveName);
        if (!directive)
            return undefined;
        return directive.args;
    }
    setDirectiveByName(directiveName, args) {
        const directives = this.getDirectives();
        const idx = directives.findIndex((d) => d.name === directiveName);
        if (idx >= 0) {
            directives[idx].args = args;
        }
        else {
            directives.push({ name: directiveName, args });
        }
        this.setDirectives(directives);
        return this;
    }
    getDirectiveById(idx) {
        const directive = this.getDirectives()[idx];
        if (!directive)
            return undefined;
        return directive.args;
    }
    getFieldDirectives(fieldName) {
        return this.getField(fieldName).directives || [];
    }
    setFieldDirectives(fieldName, directives) {
        const fc = this.getField(fieldName);
        fc.directives = directives;
        this._gqcIsModified = true;
        return this;
    }
    getFieldDirectiveNames(fieldName) {
        return this.getFieldDirectives(fieldName).map((d) => d.name);
    }
    getFieldDirectiveByName(fieldName, directiveName) {
        const directive = this.getFieldDirectives(fieldName).find((d) => d.name === directiveName);
        if (!directive)
            return undefined;
        return directive.args;
    }
    setFieldDirectiveByName(fieldName, directiveName, args) {
        const directives = this.getFieldDirectives(fieldName);
        const idx = directives.findIndex((d) => d.name === directiveName);
        if (idx >= 0) {
            directives[idx].args = args;
        }
        else {
            directives.push({ name: directiveName, args });
        }
        this.setFieldDirectives(fieldName, directives);
        return this;
    }
    getFieldDirectiveById(fieldName, idx) {
        const directive = this.getFieldDirectives(fieldName)[idx];
        if (!directive)
            return undefined;
        return directive.args;
    }
    get(path) {
        return typeByPath(this, path);
    }
    getNestedTCs(opts = {}, passedTypes = new Set()) {
        const exclude = Array.isArray(opts.exclude) ? opts.exclude : [];
        this.getFieldNames().forEach((fieldName) => {
            const itc = this.getFieldTC(fieldName);
            if (!passedTypes.has(itc) && !exclude.includes(itc.getTypeName())) {
                passedTypes.add(itc);
                if (itc instanceof InputTypeComposer) {
                    itc.getNestedTCs(opts, passedTypes);
                }
            }
        });
        return passedTypes;
    }
    toSDL(opts) {
        const { deep, ...innerOpts } = opts || {};
        innerOpts.sortTypes = innerOpts.sortTypes || false;
        const exclude = Array.isArray(innerOpts.exclude) ? innerOpts.exclude : [];
        if (deep) {
            let r = '';
            r += printInputObject(this.getType(), innerOpts);
            const nestedTypes = Array.from(this.getNestedTCs({ exclude }));
            const sortMethod = getSortMethodFromOption(innerOpts.sortAll || innerOpts.sortTypes);
            if (sortMethod) {
                nestedTypes.sort(sortMethod);
            }
            nestedTypes.forEach((t) => {
                if (t !== this && !exclude.includes(t.getTypeName())) {
                    const sdl = t.toSDL(innerOpts);
                    if (sdl)
                        r += `\n\n${sdl}`;
                }
            });
            return r;
        }
        return printInputObject(this.getType(), innerOpts);
    }
}
