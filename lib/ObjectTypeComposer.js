import { GraphQLObjectType, GraphQLInterfaceType } from 'graphql';
import { InputTypeComposer } from './InputTypeComposer';
import { UnionTypeComposer } from './UnionTypeComposer';
import { InterfaceTypeComposer, } from './InterfaceTypeComposer';
import { Resolver, } from './Resolver';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { ThunkComposer } from './ThunkComposer';
import { EnumTypeComposer } from './EnumTypeComposer';
import { resolveMaybeThunk, upperFirst, inspect, mapEachKey } from './utils/misc';
import { isObject, isFunction, isString } from './utils/is';
import { defineFieldMap, convertObjectFieldMapToConfig, convertInterfaceArrayAsThunk, } from './utils/configToDefine';
import { toInputObjectType } from './utils/toInputType';
import { typeByPath } from './utils/typeByPath';
import { getComposeTypeName, unwrapOutputTC, unwrapInputTC, isTypeNameString, cloneTypeTo, replaceTC, } from './utils/typeHelpers';
import { graphqlVersion } from './utils/graphqlVersion';
import { createThunkedObjectProxy } from './utils/createThunkedObjectProxy';
import { printObject } from './utils/schemaPrinter';
import { getObjectTypeDefinitionNode } from './utils/definitionNode';
import { getSortMethodFromOption } from './utils/schemaPrinterSortTypes';
export class ObjectTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `ObjectTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, ObjectTypeComposer)) {
            return schemaComposer.getOTC(typeDef);
        }
        const tc = this.createTemp(typeDef, schemaComposer);
        const typeName = tc.getTypeName();
        if (typeName !== 'Query' && typeName !== 'Mutation' && typeName !== 'Subscription') {
            schemaComposer.add(tc);
        }
        return tc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let TC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                TC = new ObjectTypeComposer(new GraphQLObjectType({
                    name: typeName,
                    fields: () => ({}),
                }), sc);
            }
            else {
                TC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(TC instanceof ObjectTypeComposer)) {
                    throw new Error('You should provide correct GraphQLObjectType type definition. ' +
                        'Eg. `type MyType { name: String }`');
                }
            }
        }
        else if (typeDef instanceof GraphQLObjectType) {
            TC = new ObjectTypeComposer(typeDef, sc);
        }
        else if (typeDef instanceof ObjectTypeComposer) {
            return typeDef;
        }
        else if (isObject(typeDef)) {
            const type = new GraphQLObjectType({
                ...typeDef,
                fields: () => ({}),
            });
            TC = new ObjectTypeComposer(type, sc);
            const fields = typeDef.fields;
            if (isFunction(fields)) {
                TC.addFields(convertObjectFieldMapToConfig(fields, sc));
            }
            else if (isObject(fields)) {
                TC.addFields(fields);
            }
            const interfaces = typeDef.interfaces;
            if (Array.isArray(interfaces))
                TC.setInterfaces(interfaces);
            else if (isFunction(interfaces)) {
                TC.setInterfaces(convertInterfaceArrayAsThunk(interfaces, sc));
            }
            TC.setExtensions(typeDef.extensions);
            if (Array.isArray(typeDef?.directives)) {
                TC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide GraphQLObjectTypeConfig or string with type name to ObjectTypeComposer.create(opts). Provided:\n${inspect(typeDef)}`);
        }
        return TC;
    }
    constructor(graphqlType, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new ObjectTypeComposer(GraphQLObjectType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLObjectType)) {
            throw new Error('ObjectTypeComposer accept only GraphQLObjectType in constructor');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        const typename = graphqlType.name;
        if (typename !== 'Query' && typename !== 'Mutation' && typename !== 'Subscription') {
            this.schemaComposer.set(typename, this);
        }
        if (graphqlVersion >= 14) {
            this._gqcFields = convertObjectFieldMapToConfig(this._gqType._fields, this.schemaComposer);
            this._gqcInterfaces = convertInterfaceArrayAsThunk(this._gqType._interfaces, this.schemaComposer);
        }
        else {
            const fields = this._gqType._typeConfig
                .fields;
            this._gqcFields = this.schemaComposer.typeMapper.convertOutputFieldConfigMap((resolveMaybeThunk(fields) || {}), this.getTypeName());
            this._gqcInterfaces = convertInterfaceArrayAsThunk(this._gqType._interfaces || this._gqType._typeConfig.interfaces, this.schemaComposer);
        }
        if (!this._gqType.astNode) {
            this._gqType.astNode = getObjectTypeDefinitionNode(this);
        }
        this._gqcIsModified = false;
    }
    getFields() {
        return this._gqcFields;
    }
    getFieldNames() {
        return Object.keys(this._gqcFields);
    }
    getField(fieldName) {
        if (isFunction(this._gqcFields[fieldName])) {
            const unwrappedFieldConfig = this._gqcFields[fieldName](this.schemaComposer);
            this.setField(fieldName, unwrappedFieldConfig);
        }
        const field = this._gqcFields[fieldName];
        if (!field) {
            throw new Error(`Cannot get field '${fieldName}' from type '${this.getTypeName()}'. Field does not exist.`);
        }
        return field;
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
            : this.schemaComposer.typeMapper.convertOutputFieldConfig(fieldConfig, fieldName, this.getTypeName());
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
                    childTC = ObjectTypeComposer.create(`${this.getTypeName()}${upperFirst(name)}`, this.schemaComposer);
                    this.setField(name, {
                        type: childTC,
                        resolve: () => ({}),
                    });
                }
                else {
                    childTC = this.getFieldTC(name);
                }
                if (childTC instanceof ObjectTypeComposer) {
                    childTC.addNestedFields({ [names.join('.')]: fc });
                }
            }
        });
        return this;
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
                    if (subTC instanceof ObjectTypeComposer || subTC instanceof EnumTypeComposer) {
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
    extendField(fieldName, partialFieldConfig) {
        let prevFieldConfig;
        try {
            prevFieldConfig = this.getField(fieldName);
        }
        catch (e) {
            throw new Error(`Cannot extend field '${fieldName}' from type '${this.getTypeName()}'. Field does not exist.`);
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
    getFieldConfig(fieldName) {
        const { type, args, ...rest } = this.getField(fieldName);
        return {
            type: type.getType(),
            args: args &&
                mapEachKey(args, (ac) => ({
                    ...ac,
                    type: ac.type.getType(),
                })),
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
        return unwrapOutputTC(anyTC);
    }
    getFieldOTC(fieldName) {
        const tc = this.getFieldTC(fieldName);
        if (!(tc instanceof ObjectTypeComposer)) {
            throw new Error(`${this.getTypeName()}.getFieldOTC('${fieldName}') must be ObjectTypeComposer, but received ${tc.constructor.name}. Maybe you need to use 'getFieldTC()' method which returns any type composer?`);
        }
        return tc;
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
    deprecateFields(fields) {
        const existedFieldNames = this.getFieldNames();
        if (typeof fields === 'string') {
            if (existedFieldNames.indexOf(fields) === -1) {
                throw new Error(`Cannot deprecate non-existent field '${fields}' from type '${this.getTypeName()}'`);
            }
            this.extendField(fields, { deprecationReason: 'deprecated' });
        }
        else if (Array.isArray(fields)) {
            fields.forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent field '${field}' from type '${this.getTypeName()}'`);
                }
                this.extendField(field, { deprecationReason: 'deprecated' });
            });
        }
        else {
            const fieldMap = fields;
            Object.keys(fieldMap).forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent field '${field}' from type '${this.getTypeName()}'`);
                }
                const deprecationReason = fieldMap[field];
                this.extendField(field, { deprecationReason });
            });
        }
        return this;
    }
    getFieldArgs(fieldName) {
        try {
            const fc = this.getField(fieldName);
            return fc.args || {};
        }
        catch (e) {
            throw new Error(`Cannot get args from '${this.getTypeName()}.${fieldName}'. Field does not exist.`);
        }
    }
    getFieldArgNames(fieldName) {
        return Object.keys(this.getFieldArgs(fieldName));
    }
    hasFieldArg(fieldName, argName) {
        try {
            const fieldArgs = this.getFieldArgs(fieldName);
            return !!fieldArgs[argName];
        }
        catch (e) {
            return false;
        }
    }
    getFieldArg(fieldName, argName) {
        const fieldArgs = this.getFieldArgs(fieldName);
        const arg = fieldArgs[argName];
        if (!arg) {
            throw new Error(`Cannot get '${this.getTypeName()}.${fieldName}@${argName}'. Argument does not exist.`);
        }
        return arg;
    }
    getFieldArgType(fieldName, argName) {
        const ac = this.getFieldArg(fieldName, argName);
        return ac.type.getType();
    }
    getFieldArgTypeName(fieldName, argName) {
        const ac = this.getFieldArg(fieldName, argName);
        return ac.type.getTypeName();
    }
    getFieldArgTC(fieldName, argName) {
        const anyTC = this.getFieldArg(fieldName, argName).type;
        return unwrapInputTC(anyTC);
    }
    getFieldArgITC(fieldName, argName) {
        const tc = this.getFieldArgTC(fieldName, argName);
        if (!(tc instanceof InputTypeComposer)) {
            throw new Error(`${this.getTypeName()}.getFieldArgITC('${fieldName}', '${argName}') must be InputTypeComposer, but received ${tc.constructor.name}. Maybe you need to use 'getFieldArgTC()' method which returns any type composer?`);
        }
        return tc;
    }
    setFieldArgs(fieldName, args) {
        const fc = this.getField(fieldName);
        fc.args = this.schemaComposer.typeMapper.convertArgConfigMap(args, fieldName, this.getTypeName());
        this._gqcIsModified = true;
        return this;
    }
    addFieldArgs(fieldName, newArgs) {
        const fc = this.getField(fieldName);
        fc.args = {
            ...fc.args,
            ...this.schemaComposer.typeMapper.convertArgConfigMap(newArgs, fieldName, this.getTypeName()),
        };
        this._gqcIsModified = true;
        return this;
    }
    setFieldArg(fieldName, argName, argConfig) {
        const fc = this.getField(fieldName);
        fc.args = fc.args || {};
        fc.args[argName] = this.schemaComposer.typeMapper.convertArgConfig(argConfig, argName, fieldName, this.getTypeName());
        this._gqcIsModified = true;
        return this;
    }
    removeFieldArg(fieldName, argNameOrArray) {
        const argNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        const args = this._gqcFields[fieldName] && this._gqcFields[fieldName].args;
        if (args) {
            argNames.forEach((argName) => delete args[argName]);
            this._gqcIsModified = true;
        }
        return this;
    }
    removeFieldOtherArgs(fieldName, argNameOrArray) {
        const keepArgNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        const args = this._gqcFields[fieldName] && this._gqcFields[fieldName].args;
        if (args) {
            Object.keys(args).forEach((argName) => {
                if (keepArgNames.indexOf(argName) === -1) {
                    delete args[argName];
                    this._gqcIsModified = true;
                }
            });
        }
        return this;
    }
    isFieldArgPlural(fieldName, argName) {
        const type = this.getFieldArg(fieldName, argName).type;
        return (type instanceof ListComposer ||
            (type instanceof NonNullComposer && type.ofType instanceof ListComposer));
    }
    makeFieldArgPlural(fieldName, argNameOrArray) {
        const args = this.getField(fieldName).args;
        if (!args)
            return this;
        const argNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        argNames.forEach((argName) => {
            const ac = args[argName];
            if (ac && !(ac.type instanceof ListComposer)) {
                ac.type = new ListComposer(ac.type);
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    makeFieldArgNonPlural(fieldName, argNameOrArray) {
        const args = this.getField(fieldName).args;
        if (!args)
            return this;
        const argNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        argNames.forEach((argName) => {
            const ac = args[argName];
            if (ac) {
                if (ac.type instanceof ListComposer) {
                    ac.type = ac.type.ofType;
                    this._gqcIsModified = true;
                }
                else if (ac.type instanceof NonNullComposer && ac.type.ofType instanceof ListComposer) {
                    ac.type =
                        ac.type.ofType.ofType instanceof NonNullComposer
                            ? ac.type.ofType.ofType
                            : new NonNullComposer(ac.type.ofType.ofType);
                    this._gqcIsModified = true;
                }
            }
        });
        return this;
    }
    isFieldArgNonNull(fieldName, argName) {
        const type = this.getFieldArg(fieldName, argName).type;
        return type instanceof NonNullComposer;
    }
    makeFieldArgNonNull(fieldName, argNameOrArray) {
        const args = this.getField(fieldName).args;
        if (!args)
            return this;
        const argNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        argNames.forEach((argName) => {
            const ac = args[argName];
            if (ac && !(ac.type instanceof NonNullComposer)) {
                ac.type = new NonNullComposer(ac.type);
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    makeFieldArgNullable(fieldName, argNameOrArray) {
        const args = this.getField(fieldName).args;
        if (!args)
            return this;
        const argNames = Array.isArray(argNameOrArray) ? argNameOrArray : [argNameOrArray];
        argNames.forEach((argName) => {
            const ac = args[argName];
            if (ac && ac.type instanceof NonNullComposer) {
                ac.type = ac.type.ofType;
                this._gqcIsModified = true;
            }
        });
        return this;
    }
    getType() {
        if (this._gqcIsModified) {
            this._gqcIsModified = false;
            this._gqType.astNode = getObjectTypeDefinitionNode(this);
            if (graphqlVersion >= 14) {
                this._gqType._fields = () => defineFieldMap(this._gqType, mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name)), this._gqType.astNode);
                this._gqType._interfaces = () => this.getInterfacesTypes();
            }
            else {
                this._gqType._typeConfig.fields = () => {
                    return mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name));
                };
                this._gqType._typeConfig.interfaces = () => this.getInterfacesTypes();
                delete this._gqType._fields;
                delete this._gqType._interfaces;
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
            throw new Error('You should provide newTypeName:string for ObjectTypeComposer.clone()');
        }
        const cloned = newTypeNameOrTC instanceof ObjectTypeComposer
            ? newTypeNameOrTC
            : ObjectTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
        cloned._gqcFields = mapEachKey(this._gqcFields, (fieldConfig) => ({
            ...fieldConfig,
            args: mapEachKey(fieldConfig.args || {}, (argConfig) => ({
                ...argConfig,
                extensions: { ...argConfig.extensions },
                directives: [...(argConfig.directives || [])],
            })),
            extensions: { ...fieldConfig.extensions },
            directives: [...(fieldConfig.directives || [])],
        }));
        cloned._gqcInterfaces = [...this._gqcInterfaces];
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned._gqcGetRecordIdFn = this._gqcGetRecordIdFn;
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        this.getResolvers().forEach((resolver) => {
            const newResolver = resolver.clone();
            newResolver.type = replaceTC(newResolver.type, (tc) => {
                return tc === this ? cloned : tc;
            });
            cloned.addResolver(newResolver);
        });
        return cloned;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        if (!anotherSchemaComposer) {
            throw new Error('You should provide SchemaComposer for ObjectTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return cloneMap.get(this);
        const cloned = ObjectTypeComposer.create(this.getTypeName(), anotherSchemaComposer);
        cloneMap.set(this, cloned);
        cloned._gqcFields = mapEachKey(this._gqcFields, (fieldConfig) => ({
            ...fieldConfig,
            type: cloneTypeTo(fieldConfig.type, anotherSchemaComposer, cloneMap),
            args: mapEachKey(fieldConfig.args, (argConfig) => ({
                ...argConfig,
                type: cloneTypeTo(argConfig.type, anotherSchemaComposer, cloneMap),
                extensions: { ...argConfig.extensions },
                directives: [...(argConfig.directives || [])],
            })),
            extensions: { ...fieldConfig.extensions },
            directives: [...(fieldConfig.directives || [])],
        }));
        cloned._gqcInterfaces = this._gqcInterfaces.map((i) => i.cloneTo(anotherSchemaComposer, cloneMap));
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned._gqcGetRecordIdFn = this._gqcGetRecordIdFn;
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        this.getResolvers().forEach((resolver) => {
            const clonedResolver = resolver.cloneTo(anotherSchemaComposer, cloneMap);
            cloned.addResolver(clonedResolver);
        });
        return cloned;
    }
    getIsTypeOf() {
        return this._gqType.isTypeOf;
    }
    setIsTypeOf(fn) {
        this._gqType.isTypeOf = fn;
        this._gqcIsModified = true;
        return this;
    }
    merge(type) {
        let tc;
        if (type instanceof ObjectTypeComposer || type instanceof InterfaceTypeComposer) {
            tc = type;
        }
        else if (type instanceof GraphQLObjectType) {
            tc = ObjectTypeComposer.createTemp(type, this.schemaComposer);
        }
        else if (type instanceof GraphQLInterfaceType) {
            tc = InterfaceTypeComposer.createTemp(type, this.schemaComposer);
        }
        else {
            throw new Error(`Cannot merge ${inspect(type)} with ObjectType(${this.getTypeName()}). Provided type should be GraphQLInterfaceType, GraphQLObjectType, InterfaceTypeComposer or ObjectTypeComposer.`);
        }
        const fields = { ...tc.getFields() };
        Object.keys(fields).forEach((fieldName) => {
            fields[fieldName] = {
                ...fields[fieldName],
                args: {
                    ...fields[fieldName].args,
                },
                type: tc.getFieldTypeName(fieldName),
            };
            tc.getFieldArgNames(fieldName).forEach((argName) => {
                fields[fieldName].args[argName] = {
                    ...fields[fieldName].args[argName],
                    type: tc.getFieldArgTypeName(fieldName, argName),
                };
            });
        });
        this.addFields(fields);
        this.addInterfaces(tc.getInterfaces().map((i) => i.getTypeName()));
        return this;
    }
    getInputType() {
        return this.getInputTypeComposer().getType();
    }
    hasInputTypeComposer() {
        return !!this._gqcInputTypeComposer;
    }
    setInputTypeComposer(itc) {
        this._gqcInputTypeComposer = itc;
        return this;
    }
    getInputTypeComposer(opts) {
        if (!this._gqcInputTypeComposer) {
            this._gqcInputTypeComposer = toInputObjectType(this, opts);
        }
        return this._gqcInputTypeComposer;
    }
    getITC(opts) {
        return this.getInputTypeComposer(opts);
    }
    removeInputTypeComposer() {
        this._gqcInputTypeComposer = undefined;
        return this;
    }
    getResolvers() {
        if (!this._gqcResolvers) {
            this._gqcResolvers = new Map();
        }
        return this._gqcResolvers;
    }
    hasResolver(name) {
        if (!this._gqcResolvers) {
            return false;
        }
        return this._gqcResolvers.has(name);
    }
    getResolver(name, middlewares) {
        if (!this.hasResolver(name)) {
            throw new Error(`Type ${this.getTypeName()} does not have resolver with name '${name}'`);
        }
        const resolverMap = this._gqcResolvers;
        const resolver = resolverMap.get(name);
        if (Array.isArray(middlewares)) {
            return resolver.withMiddlewares(middlewares);
        }
        return resolver;
    }
    setResolver(name, resolver) {
        if (!this._gqcResolvers) {
            this._gqcResolvers = new Map();
        }
        if (!(resolver instanceof Resolver)) {
            throw new Error('setResolver() accept only Resolver instance');
        }
        this._gqcResolvers.set(name, resolver);
        resolver.setDisplayName(`${this.getTypeName()}.${resolver.name}`);
        return this;
    }
    addResolver(opts) {
        if (!opts) {
            throw new Error('addResolver called with empty Resolver');
        }
        let resolver;
        if (!(opts instanceof Resolver)) {
            const resolverOpts = { ...opts };
            if (!resolverOpts.hasOwnProperty('resolve')) {
                resolverOpts.resolve = () => ({});
            }
            resolver = new Resolver(resolverOpts, this.schemaComposer);
        }
        else {
            resolver = opts;
        }
        if (!resolver.name) {
            throw new Error('resolver should have non-empty `name` property');
        }
        this.setResolver(resolver.name, resolver);
        return this;
    }
    removeResolver(resolverName) {
        if (resolverName) {
            this.getResolvers().delete(resolverName);
        }
        return this;
    }
    wrapResolver(resolverName, cbResolver) {
        const resolver = this.getResolver(resolverName);
        const newResolver = resolver.wrap(cbResolver);
        this.setResolver(resolverName, newResolver);
        return this;
    }
    wrapResolverAs(resolverName, fromResolverName, cbResolver) {
        const resolver = this.getResolver(fromResolverName);
        const newResolver = resolver.wrap(cbResolver);
        this.setResolver(resolverName, newResolver);
        return this;
    }
    wrapResolverResolve(resolverName, cbNextRp) {
        const resolver = this.getResolver(resolverName);
        this.setResolver(resolverName, resolver.wrapResolve(cbNextRp));
        return this;
    }
    getInterfaces() {
        return this._gqcInterfaces;
    }
    getInterfacesTypes() {
        return this._gqcInterfaces.map((i) => i.getType());
    }
    setInterfaces(interfaces) {
        this._gqcInterfaces = convertInterfaceArrayAsThunk(interfaces, this.schemaComposer);
        this._gqcIsModified = true;
        return this;
    }
    hasInterface(iface) {
        const typeName = getComposeTypeName(iface, this.schemaComposer);
        return !!this._gqcInterfaces.find((i) => i.getTypeName() === typeName);
    }
    addInterface(iface) {
        if (!this.hasInterface(iface)) {
            this._gqcInterfaces.push(this.schemaComposer.typeMapper.convertInterfaceTypeDefinition(iface));
            this._gqcIsModified = true;
        }
        return this;
    }
    addInterfaces(ifaces) {
        if (!Array.isArray(ifaces)) {
            throw new Error(`ObjectTypeComposer[${this.getTypeName()}].addInterfaces() accepts only array`);
        }
        ifaces.forEach((iface) => this.addInterface(iface));
        return this;
    }
    removeInterface(iface) {
        const typeName = getComposeTypeName(iface, this.schemaComposer);
        this._gqcInterfaces = this._gqcInterfaces.filter((i) => i.getTypeName() !== typeName);
        this._gqcIsModified = true;
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
    getFieldArgExtensions(fieldName, argName) {
        const ac = this.getFieldArg(fieldName, argName);
        return ac.extensions || {};
    }
    setFieldArgExtensions(fieldName, argName, extensions) {
        const ac = this.getFieldArg(fieldName, argName);
        this.setFieldArg(fieldName, argName, { ...ac, extensions });
        return this;
    }
    extendFieldArgExtensions(fieldName, argName, extensions) {
        const current = this.getFieldArgExtensions(fieldName, argName);
        this.setFieldArgExtensions(fieldName, argName, {
            ...current,
            ...extensions,
        });
        return this;
    }
    clearFieldArgExtensions(fieldName, argName) {
        this.setFieldArgExtensions(fieldName, argName, {});
        return this;
    }
    getFieldArgExtension(fieldName, argName, extensionName) {
        const extensions = this.getFieldArgExtensions(fieldName, argName);
        return extensions[extensionName];
    }
    hasFieldArgExtension(fieldName, argName, extensionName) {
        const extensions = this.getFieldArgExtensions(fieldName, argName);
        return extensionName in extensions;
    }
    setFieldArgExtension(fieldName, argName, extensionName, value) {
        this.extendFieldArgExtensions(fieldName, argName, {
            [extensionName]: value,
        });
        return this;
    }
    removeFieldArgExtension(fieldName, argName, extensionName) {
        const extensions = { ...this.getFieldArgExtensions(fieldName, argName) };
        delete extensions[extensionName];
        this.setFieldArgExtensions(fieldName, argName, extensions);
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
    getFieldArgDirectives(fieldName, argName) {
        return this.getFieldArg(fieldName, argName).directives || [];
    }
    setFieldArgDirectives(fieldName, argName, directives) {
        const ac = this.getFieldArg(fieldName, argName);
        ac.directives = directives;
        this._gqcIsModified = true;
        return this;
    }
    getFieldArgDirectiveNames(fieldName, argName) {
        return this.getFieldArgDirectives(fieldName, argName).map((d) => d.name);
    }
    getFieldArgDirectiveByName(fieldName, argName, directiveName) {
        const directive = this.getFieldArgDirectives(fieldName, argName).find((d) => d.name === directiveName);
        if (!directive)
            return undefined;
        return directive.args;
    }
    setFieldArgDirectiveByName(fieldName, argName, directiveName, args) {
        const directives = this.getFieldArgDirectives(fieldName, argName);
        const idx = directives.findIndex((d) => d.name === directiveName);
        if (idx >= 0) {
            directives[idx].args = args;
        }
        else {
            directives.push({ name: directiveName, args });
        }
        this.setFieldArgDirectives(fieldName, argName, directives);
        return this;
    }
    getFieldArgDirectiveById(fieldName, argName, idx) {
        const directive = this.getFieldArgDirectives(fieldName, argName)[idx];
        if (!directive)
            return undefined;
        return directive.args;
    }
    addRelation(fieldName, opts) {
        if (!this._gqcRelations) {
            this._gqcRelations = {};
        }
        this._gqcRelations[fieldName] = opts;
        this._gqcIsModified = true;
        if (opts.hasOwnProperty('resolver')) {
            if (isFunction(opts.resolver)) {
                this._gqcFields[fieldName] = createThunkedObjectProxy(() => this._relationWithResolverToFC(opts, fieldName));
            }
            else {
                this._gqcFields[fieldName] = this._relationWithResolverToFC(opts, fieldName);
            }
        }
        else if (opts.hasOwnProperty('type')) {
            const fc = opts;
            this.setField(fieldName, fc);
        }
        return this;
    }
    getRelations() {
        if (!this._gqcRelations) {
            this._gqcRelations = {};
        }
        return this._gqcRelations;
    }
    _relationWithResolverToFC(opts, fieldName = '') {
        const resolver = isFunction(opts.resolver) ? opts.resolver(this.schemaComposer) : opts.resolver;
        if (!(resolver instanceof Resolver)) {
            throw new Error('You should provide correct Resolver object for relation ' +
                `${this.getTypeName()}.${fieldName}`);
        }
        if (opts.type) {
            throw new Error('You can not use `resolver` and `type` properties simultaneously for relation ' +
                `${this.getTypeName()}.${fieldName}`);
        }
        if (opts.resolve) {
            throw new Error('You can not use `resolver` and `resolve` properties simultaneously for relation ' +
                `${this.getTypeName()}.${fieldName}`);
        }
        const argsConfig = { ...resolver.args };
        const argsProto = {};
        const argsRuntime = [];
        const optsArgs = opts.prepareArgs || {};
        Object.keys(optsArgs).forEach((argName) => {
            const argMapVal = optsArgs[argName];
            if (argMapVal !== undefined) {
                delete argsConfig[argName];
                if (isFunction(argMapVal)) {
                    argsRuntime.push([argName, argMapVal]);
                }
                else if (argMapVal !== null) {
                    argsProto[argName] = argMapVal;
                }
            }
        });
        const { catchErrors = true } = opts;
        const fieldConfig = resolver.getFieldConfig();
        const resolve = (source, args, context, info) => {
            const newArgs = { ...args, ...argsProto };
            argsRuntime.forEach(([argName, argFn]) => {
                newArgs[argName] = argFn(source, args, context, info);
            });
            const payload = fieldConfig.resolve
                ? fieldConfig.resolve(source, newArgs, context, info)
                : null;
            return catchErrors
                ? Promise.resolve(payload).catch((e) => {
                    console.log(`GQC ERROR: relation for ${this.getTypeName()}.${fieldName} throws error:`);
                    console.log(e);
                    return null;
                })
                : payload;
        };
        return {
            type: resolver.type,
            description: opts.description || resolver.description,
            deprecationReason: opts.deprecationReason,
            args: argsConfig,
            resolve,
            projection: opts.projection,
            extensions: {
                ...resolver.extensions,
                ...opts.extensions,
            },
        };
    }
    setRecordIdFn(fn) {
        this._gqcGetRecordIdFn = fn;
        return this;
    }
    hasRecordIdFn() {
        return !!this._gqcGetRecordIdFn;
    }
    getRecordIdFn() {
        if (!this._gqcGetRecordIdFn) {
            throw new Error(`Type ${this.getTypeName()} does not have RecordIdFn`);
        }
        return this._gqcGetRecordIdFn;
    }
    getRecordId(source, args, context) {
        return this.getRecordIdFn()(source, args, context);
    }
    get(path) {
        return typeByPath(this, path);
    }
    getNestedTCs(opts = {}, passedTypes = new Set()) {
        const exclude = Array.isArray(opts.exclude) ? opts.exclude : [];
        this.getFieldNames().forEach((fieldName) => {
            const tc = this.getFieldTC(fieldName);
            if (!passedTypes.has(tc) && !exclude.includes(tc.getTypeName())) {
                passedTypes.add(tc);
                if (tc instanceof ObjectTypeComposer || tc instanceof UnionTypeComposer) {
                    tc.getNestedTCs(opts, passedTypes);
                }
            }
            this.getFieldArgNames(fieldName).forEach((argName) => {
                const itc = this.getFieldArgTC(fieldName, argName);
                if (!passedTypes.has(itc) && !exclude.includes(itc.getTypeName())) {
                    passedTypes.add(itc);
                    if (itc instanceof InputTypeComposer) {
                        itc.getNestedTCs(opts, passedTypes);
                    }
                }
            });
        });
        this.getInterfaces().forEach((t) => {
            const iftc = t instanceof ThunkComposer ? t.ofType : t;
            if (!passedTypes.has(iftc) && !exclude.includes(iftc.getTypeName())) {
                passedTypes.add(iftc);
                iftc.getNestedTCs(opts, passedTypes);
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
            r += printObject(this.getType(), innerOpts);
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
        return printObject(this.getType(), innerOpts);
    }
}
