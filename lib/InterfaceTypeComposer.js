import { GraphQLInterfaceType, GraphQLObjectType } from 'graphql';
import { isObject, isString, isFunction } from './utils/is';
import { resolveMaybeThunk, inspect, mapEachKey } from './utils/misc';
import { ObjectTypeComposer } from './ObjectTypeComposer';
import { InputTypeComposer } from './InputTypeComposer';
import { UnionTypeComposer } from './UnionTypeComposer';
import { EnumTypeComposer } from './EnumTypeComposer';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { ThunkComposer } from './ThunkComposer';
import { toInputObjectType } from './utils/toInputType';
import { typeByPath } from './utils/typeByPath';
import { getComposeTypeName, getGraphQLType, unwrapOutputTC, unwrapInputTC, isTypeNameString, cloneTypeTo, } from './utils/typeHelpers';
import { defineFieldMap, convertObjectFieldMapToConfig, convertInterfaceArrayAsThunk, } from './utils/configToDefine';
import { graphqlVersion } from './utils/graphqlVersion';
import { printInterface } from './utils/schemaPrinter';
import { getInterfaceTypeDefinitionNode } from './utils/definitionNode';
import { getSortMethodFromOption } from './utils/schemaPrinterSortTypes';
export class InterfaceTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `InterfaceTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, InterfaceTypeComposer)) {
            return schemaComposer.getIFTC(typeDef);
        }
        const iftc = this.createTemp(typeDef, schemaComposer);
        schemaComposer.add(iftc);
        return iftc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let IFTC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                IFTC = new InterfaceTypeComposer(new GraphQLInterfaceType({
                    name: typeName,
                    fields: () => ({}),
                }), sc);
            }
            else {
                IFTC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(IFTC instanceof InterfaceTypeComposer)) {
                    throw new Error('You should provide correct GraphQLInterfaceType type definition. ' +
                        'Eg. `interface MyType { id: ID!, name: String! }`');
                }
            }
        }
        else if (typeDef instanceof GraphQLInterfaceType) {
            IFTC = new InterfaceTypeComposer(typeDef, sc);
        }
        else if (typeDef instanceof InterfaceTypeComposer) {
            IFTC = typeDef;
        }
        else if (isObject(typeDef) && !(typeDef instanceof InterfaceTypeComposer)) {
            const type = new GraphQLInterfaceType({
                ...typeDef,
                fields: () => ({}),
            });
            IFTC = new InterfaceTypeComposer(type, sc);
            const fields = typeDef.fields;
            if (isFunction(fields)) {
                IFTC.addFields(convertObjectFieldMapToConfig(fields, sc));
            }
            else if (isObject(fields)) {
                IFTC.addFields(fields);
            }
            const interfaces = typeDef.interfaces;
            if (Array.isArray(interfaces))
                IFTC.setInterfaces(interfaces);
            else if (isFunction(interfaces)) {
                IFTC.setInterfaces(convertInterfaceArrayAsThunk(interfaces, sc));
            }
            IFTC.setExtensions(typeDef.extensions);
            if (Array.isArray(typeDef?.directives)) {
                IFTC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide GraphQLInterfaceTypeConfig or string with interface name or SDL definition. Provided:\n${inspect(typeDef)}`);
        }
        return IFTC;
    }
    constructor(graphqlType, schemaComposer) {
        this._gqcInterfaces = [];
        this._gqcFallbackResolveType = null;
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new InterfaceTypeComposer(GraphQLInterfaceType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLInterfaceType)) {
            throw new Error('InterfaceTypeComposer accept only GraphQLInterfaceType in constructor');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        this.schemaComposer.set(graphqlType.name, this);
        if (graphqlVersion >= 15) {
            this._gqcFields = convertObjectFieldMapToConfig(this._gqType._fields, this.schemaComposer);
            this._gqcInterfaces = convertInterfaceArrayAsThunk(this._gqType._interfaces, this.schemaComposer);
        }
        else if (graphqlVersion >= 14) {
            this._gqcFields = convertObjectFieldMapToConfig(this._gqType._fields, this.schemaComposer);
        }
        else {
            const fields = this._gqType._typeConfig
                .fields;
            this._gqcFields = this.schemaComposer.typeMapper.convertOutputFieldConfigMap(resolveMaybeThunk(fields) || {}, this.getTypeName());
        }
        if (!this._gqType.astNode) {
            this._gqType.astNode = getInterfaceTypeDefinitionNode(this);
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
                throw new Error(`Cannot deprecate non-existent field '${fields}' from interface type '${this.getTypeName()}'`);
            }
            this.extendField(fields, { deprecationReason: 'deprecated' });
        }
        else if (Array.isArray(fields)) {
            fields.forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent field '${field}' from interface type '${this.getTypeName()}'`);
                }
                this.extendField(field, { deprecationReason: 'deprecated' });
            });
        }
        else {
            const fieldMap = fields;
            Object.keys(fieldMap).forEach((field) => {
                if (existedFieldNames.indexOf(field) === -1) {
                    throw new Error(`Cannot deprecate non-existent field '${field}' from interface type '${this.getTypeName()}'`);
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
            throw new Error(`Cannot get field args. Field '${fieldName}' from type '${this.getTypeName()}' does not exist.`);
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
            this._gqType.astNode = getInterfaceTypeDefinitionNode(this);
            if (graphqlVersion >= 15) {
                this._gqType._fields = () => defineFieldMap(this._gqType, mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name)), this._gqType.astNode);
                this._gqType._interfaces = () => this.getInterfacesTypes();
            }
            else if (graphqlVersion >= 14) {
                this._gqType._fields = () => defineFieldMap(this._gqType, mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name)), this._gqType.astNode);
            }
            else {
                this._gqType._typeConfig.fields = () => {
                    return mapEachKey(this._gqcFields, (_, name) => this.getFieldConfig(name));
                };
                this._gqType._fields = {};
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
            throw new Error('You should provide newTypeName:string for InterfaceTypeComposer.clone()');
        }
        const cloned = newTypeNameOrTC instanceof InterfaceTypeComposer
            ? newTypeNameOrTC
            : InterfaceTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
        cloned._gqcFields = mapEachKey(this._gqcFields, (fieldConfig) => ({
            ...fieldConfig,
            args: mapEachKey(fieldConfig.args, (argConfig) => ({
                ...argConfig,
                extensions: { ...argConfig.extensions },
                directives: [...(argConfig.directives || [])],
            })),
            extensions: { ...fieldConfig.extensions },
            directives: [...(fieldConfig.directives || [])],
        }));
        cloned._gqcInterfaces = [...this._gqcInterfaces];
        if (this._gqcTypeResolvers) {
            cloned._gqcTypeResolvers = new Map(this._gqcTypeResolvers);
        }
        cloned._gqcFallbackResolveType = this._gqcFallbackResolveType;
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        return cloned;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        if (!anotherSchemaComposer) {
            throw new Error('You should provide SchemaComposer for InterfaceTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return cloneMap.get(this);
        const cloned = InterfaceTypeComposer.create(this.getTypeName(), anotherSchemaComposer);
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
        cloned.setDescription(this.getDescription());
        const typeResolversMap = this.getTypeResolvers();
        if (typeResolversMap.size > 0) {
            const clonedTypeResolvers = new Map();
            typeResolversMap.forEach((fn, tc) => {
                const clonedTC = cloneTypeTo(tc, anotherSchemaComposer, cloneMap);
                clonedTypeResolvers.set(clonedTC, fn);
            });
            cloned.setTypeResolvers(clonedTypeResolvers);
        }
        if (this._gqcFallbackResolveType) {
            cloned._gqcFallbackResolveType = cloneTypeTo(this._gqcFallbackResolveType, anotherSchemaComposer, cloneMap);
        }
        return cloned;
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
            throw new Error(`Cannot merge ${inspect(type)} with InterfaceType(${this.getTypeName()}). Provided type should be GraphQLInterfaceType, GraphQLObjectType, InterfaceTypeComposer or ObjectTypeComposer.`);
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
    getResolveType() {
        return this._gqType.resolveType;
    }
    setResolveType(fn) {
        this._gqType.resolveType = fn;
        this._gqcIsModified = true;
        return this;
    }
    hasTypeResolver(type) {
        const typeResolversMap = this.getTypeResolvers();
        return typeResolversMap.has(type);
    }
    getTypeResolvers() {
        if (!this._gqcTypeResolvers) {
            this._gqcTypeResolvers = new Map();
        }
        return this._gqcTypeResolvers;
    }
    getTypeResolverCheckFn(type) {
        const typeResolversMap = this.getTypeResolvers();
        if (!typeResolversMap.has(type)) {
            throw new Error(`Type resolve function in interface '${this.getTypeName()}' is not defined for type ${inspect(type)}.`);
        }
        return typeResolversMap.get(type);
    }
    getTypeResolverNames() {
        const typeResolversMap = this.getTypeResolvers();
        const names = [];
        typeResolversMap.forEach((_, composeType) => {
            if (composeType instanceof ObjectTypeComposer) {
                names.push(composeType.getTypeName());
            }
            else if (composeType && composeType.name) {
                names.push(composeType.name);
            }
        });
        return names;
    }
    getTypeResolverTypes() {
        const typeResolversMap = this.getTypeResolvers();
        const types = [];
        typeResolversMap.forEach((_, composeType) => {
            types.push(getGraphQLType(composeType));
        });
        return types;
    }
    setTypeResolvers(typeResolversMap) {
        this._isTypeResolversValid(typeResolversMap);
        this._gqcTypeResolvers = typeResolversMap;
        this._initResolveTypeFn();
        return this;
    }
    _initResolveTypeFn() {
        const typeResolversMap = this._gqcTypeResolvers || new Map();
        const fallbackType = this._gqcFallbackResolveType
            ? getGraphQLType(this._gqcFallbackResolveType)
            : null;
        const fastEntries = [];
        if (graphqlVersion >= 16) {
            for (const [composeType, checkFn] of typeResolversMap.entries()) {
                fastEntries.push([getComposeTypeName(composeType, this.schemaComposer), checkFn]);
            }
        }
        else {
            for (const [composeType, checkFn] of typeResolversMap.entries()) {
                fastEntries.push([getGraphQLType(composeType), checkFn]);
            }
        }
        let resolveType;
        const isAsyncRuntime = this._isTypeResolversAsync(typeResolversMap);
        if (isAsyncRuntime) {
            resolveType = async (value, context, info) => {
                for (const [_gqType, checkFn] of fastEntries) {
                    if (await checkFn(value, context, info))
                        return _gqType;
                }
                return fallbackType;
            };
        }
        else {
            resolveType = (value, context, info) => {
                for (const [_gqType, checkFn] of fastEntries) {
                    if (checkFn(value, context, info))
                        return _gqType;
                }
                return fallbackType;
            };
        }
        this.setResolveType(resolveType);
        return this;
    }
    _isTypeResolversValid(typeResolversMap) {
        if (!(typeResolversMap instanceof Map)) {
            throw new Error(`For interface ${this.getTypeName()} you should provide Map object for type resolvers.`);
        }
        for (const [composeType, checkFn] of typeResolversMap.entries()) {
            this._isTypeResolverValid(composeType, checkFn);
        }
        return true;
    }
    _isTypeResolverValid(composeType, checkFn) {
        try {
            const type = getGraphQLType(composeType);
            if (!(type instanceof GraphQLObjectType))
                throw new Error('Must be GraphQLObjectType');
        }
        catch (e) {
            throw new Error(`For interface type resolver ${this.getTypeName()} you must provide GraphQLObjectType or ObjectTypeComposer, but provided ${inspect(composeType)}`);
        }
        if (!isFunction(checkFn)) {
            throw new Error(`Interface ${this.getTypeName()} has invalid check function for type ${inspect(composeType)}`);
        }
        return true;
    }
    _isTypeResolversAsync(typeResolversMap) {
        let res = false;
        for (const [, checkFn] of typeResolversMap.entries()) {
            try {
                const r = checkFn({}, {}, {});
                if (r instanceof Promise) {
                    r.catch(() => { });
                    res = true;
                }
            }
            catch (e) {
            }
        }
        return res;
    }
    addTypeResolver(type, checkFn) {
        const typeResolversMap = this.getTypeResolvers();
        this._isTypeResolverValid(type, checkFn);
        typeResolversMap.set(type, checkFn);
        this._initResolveTypeFn();
        if (type instanceof ObjectTypeComposer) {
            type.addInterface(this);
        }
        this.schemaComposer.addSchemaMustHaveType(type);
        return this;
    }
    removeTypeResolver(type) {
        const typeResolversMap = this.getTypeResolvers();
        typeResolversMap.delete(type);
        this._initResolveTypeFn();
        return this;
    }
    setTypeResolverFallback(type) {
        if (type) {
            if (type instanceof ObjectTypeComposer) {
                type.addInterface(this);
            }
            this.schemaComposer.addSchemaMustHaveType(type);
        }
        this._gqcFallbackResolveType = type;
        this._initResolveTypeFn();
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
            throw new Error(`InterfaceTypeComposer[${this.getTypeName()}].addInterfaces() accepts only array`);
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
            this.getInterfaces().forEach((t) => {
                const iftc = t instanceof ThunkComposer ? t.ofType : t;
                if (!passedTypes.has(iftc) && !exclude.includes(iftc.getTypeName())) {
                    passedTypes.add(iftc);
                    iftc.getNestedTCs(opts, passedTypes);
                }
            });
        });
        return passedTypes;
    }
    toSDL(opts) {
        const { deep, ...innerOpts } = opts || {};
        innerOpts.sortTypes = innerOpts.sortTypes || false;
        const exclude = Array.isArray(innerOpts.exclude) ? innerOpts.exclude : [];
        if (deep) {
            let r = '';
            r += printInterface(this.getType(), innerOpts);
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
        return printInterface(this.getType(), innerOpts);
    }
}
