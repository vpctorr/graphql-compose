import { GraphQLEnumType } from 'graphql';
import { isObject, isString } from './utils/is';
import { inspect, mapEachKey, keyMap } from './utils/misc';
import { defineEnumValues, convertEnumValuesToConfig } from './utils/configToDefine';
import { graphqlVersion } from './utils/graphqlVersion';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { isTypeNameString } from './utils/typeHelpers';
import { printEnum } from './utils/schemaPrinter';
import { getEnumTypeDefinitionNode } from './utils/definitionNode';
export class EnumTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `EnumTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, EnumTypeComposer)) {
            return schemaComposer.getETC(typeDef);
        }
        const etc = this.createTemp(typeDef, schemaComposer);
        if (schemaComposer)
            schemaComposer.add(etc);
        return etc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let ETC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                ETC = new EnumTypeComposer(new GraphQLEnumType({
                    name: typeName,
                    values: graphqlVersion < 13 ? { _OldGraphqlStubValue_: {} } : {},
                }), sc);
            }
            else {
                ETC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(ETC instanceof EnumTypeComposer)) {
                    throw new Error('You should provide correct GraphQLEnumType type definition. ' +
                        'Eg. `enum MyType { KEY1 KEY2 KEY3 }`');
                }
            }
        }
        else if (typeDef instanceof GraphQLEnumType) {
            ETC = new EnumTypeComposer(typeDef, sc);
        }
        else if (isObject(typeDef)) {
            const type = new GraphQLEnumType({
                ...typeDef,
            });
            ETC = new EnumTypeComposer(type, sc);
            ETC.setFields(typeDef.values || {});
            ETC.setExtensions(typeDef.extensions);
            if (Array.isArray(typeDef?.directives)) {
                ETC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide GraphQLEnumTypeConfig or string with enum name or SDL. Provided:\n${inspect(typeDef)}`);
        }
        return ETC;
    }
    constructor(graphqlType, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new EnumTypeComposer(GraphQLEnumType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLEnumType)) {
            throw new Error('EnumTypeComposer accept only GraphQLEnumType in constructor');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        this.schemaComposer.set(graphqlType.name, this);
        this._gqcFields = convertEnumValuesToConfig(this._gqType.getValues(), this.schemaComposer);
        if (!this._gqType.astNode) {
            this._gqType.astNode = getEnumTypeDefinitionNode(this);
        }
        this._gqcIsModified = false;
    }
    hasField(name) {
        const values = this.getFields();
        return !!values[name];
    }
    getFields() {
        return this._gqcFields;
    }
    getField(name) {
        const values = this.getFields();
        if (!values[name]) {
            throw new Error(`Cannot get value '${name}' from enum type '${this.getTypeName()}'. Value with such name does not exist.`);
        }
        return values[name];
    }
    getFieldNames() {
        return Object.keys(this._gqcFields);
    }
    setFields(values) {
        this._gqcFields = {};
        Object.keys(values).forEach((valueName) => {
            this.setField(valueName, values[valueName]);
        });
        return this;
    }
    setField(name, valueConfig) {
        this._gqcFields[name] = {
            value: valueConfig.hasOwnProperty('value') ? valueConfig.value : name,
            description: valueConfig.description,
            deprecationReason: valueConfig.deprecationReason,
            extensions: valueConfig.extensions || {},
            directives: valueConfig.directives || [],
        };
        this._gqcIsModified = true;
        return this;
    }
    addFields(newValues) {
        Object.keys(newValues).forEach((valueName) => {
            this.setField(valueName, newValues[valueName]);
        });
        return this;
    }
    removeField(nameOrArray) {
        const valueNames = Array.isArray(nameOrArray) ? nameOrArray : [nameOrArray];
        valueNames.forEach((valueName) => {
            delete this._gqcFields[valueName];
            this._gqcIsModified = true;
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
    extendField(name, partialValueConfig) {
        let prevValueConfig;
        try {
            prevValueConfig = this.getField(name);
        }
        catch (e) {
            throw new Error(`Cannot extend value '${name}' from enum '${this.getTypeName()}'. Value does not exist.`);
        }
        this.setField(name, {
            ...prevValueConfig,
            ...partialValueConfig,
            extensions: {
                ...(prevValueConfig.extensions || {}),
                ...(partialValueConfig.extensions || {}),
            },
            directives: [...(prevValueConfig.directives || []), ...(partialValueConfig.directives || [])],
        });
        return this;
    }
    deprecateFields(fields) {
        const existedFieldNames = this.getFieldNames();
        if (typeof fields === 'string') {
            if (existedFieldNames.indexOf(fields) === -1) {
                throw new Error(`Cannot deprecate non-existent value '${fields}' from enum '${this.getTypeName()}'`);
            }
            this.extendField(fields, { deprecationReason: 'deprecated' });
        }
        else if (Array.isArray(fields)) {
            fields.forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent value '${field}' from enum '${this.getTypeName()}'`);
                }
                this.extendField(field, { deprecationReason: 'deprecated' });
            });
        }
        else {
            const fieldMap = fields;
            Object.keys(fieldMap).forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent value '${field}' from enum '${this.getTypeName()}'`);
                }
                const deprecationReason = fieldMap[field];
                this.extendField(field, { deprecationReason });
            });
        }
        return this;
    }
    getType() {
        const gqType = this._gqType;
        if (this._gqcIsModified) {
            this._gqcIsModified = false;
            gqType.astNode = getEnumTypeDefinitionNode(this);
            if (graphqlVersion >= 14) {
                gqType._values = defineEnumValues(gqType, this._gqcFields, gqType.astNode);
                gqType._valueLookup = new Map(gqType._values.map((enumValue) => [enumValue.value, enumValue]));
                gqType._nameLookup = keyMap(gqType._values, (value) => value.name);
            }
            else {
                delete gqType._valueLookup;
                delete gqType._nameLookup;
                gqType._values = defineEnumValues(gqType, this._gqcFields, gqType.astNode);
            }
        }
        return gqType;
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
        this.schemaComposer.add(this);
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
            throw new Error('You should provide newTypeName:string for EnumTypeComposer.clone()');
        }
        const cloned = newTypeNameOrTC instanceof EnumTypeComposer
            ? newTypeNameOrTC
            : EnumTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
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
            throw new Error('You should provide SchemaComposer for EnumTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return cloneMap.get(this);
        const cloned = EnumTypeComposer.create(this.getTypeName(), anotherSchemaComposer);
        cloneMap.set(this, cloned);
        return this.clone(cloned);
    }
    merge(type) {
        let tc;
        if (type instanceof GraphQLEnumType) {
            tc = EnumTypeComposer.createTemp(type, this.schemaComposer);
        }
        else if (type instanceof EnumTypeComposer) {
            tc = type;
        }
        else {
            throw new Error(`Cannot merge ${inspect(type)} with EnumType(${this.getTypeName()}). Provided type should be GraphQLEnumType or EnumTypeComposer.`);
        }
        this.addFields(tc.getFields());
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
        this._gqcExtensions = extensions;
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
    toSDL(opts) {
        return printEnum(this.getType(), opts);
    }
}