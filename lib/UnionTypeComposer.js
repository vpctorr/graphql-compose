import { GraphQLUnionType, } from 'graphql';
import { isObject, isString, isFunction } from './utils/is';
import { inspect } from './utils/misc';
import { ObjectTypeComposer, } from './ObjectTypeComposer';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { ThunkComposer } from './ThunkComposer';
import { convertObjectTypeArrayAsThunk } from './utils/configToDefine';
import { getGraphQLType, getComposeTypeName, unwrapOutputTC, isTypeNameString, cloneTypeTo, } from './utils/typeHelpers';
import { graphqlVersion } from './utils/graphqlVersion';
import { printUnion } from './utils/schemaPrinter';
import { getUnionTypeDefinitionNode } from './utils/definitionNode';
import { getSortMethodFromOption } from './utils/schemaPrinterSortTypes';
export class UnionTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `UnionTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, UnionTypeComposer)) {
            return schemaComposer.getUTC(typeDef);
        }
        const utc = this.createTemp(typeDef, schemaComposer);
        schemaComposer.add(utc);
        return utc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let UTC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                UTC = new UnionTypeComposer(new GraphQLUnionType({
                    name: typeName,
                    types: () => [],
                }), sc);
            }
            else {
                UTC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(UTC instanceof UnionTypeComposer)) {
                    throw new Error('You should provide correct GraphQLUnionType type definition. ' +
                        'Eg. `union MyType = Photo | Person`');
                }
            }
        }
        else if (typeDef instanceof GraphQLUnionType) {
            UTC = new UnionTypeComposer(typeDef, sc);
        }
        else if (isObject(typeDef)) {
            const type = new GraphQLUnionType({
                ...typeDef,
                types: () => [],
            });
            UTC = new UnionTypeComposer(type, sc);
            const types = typeDef.types;
            if (Array.isArray(types))
                UTC.setTypes(types);
            else if (isFunction(types)) {
                UTC.setTypes(convertObjectTypeArrayAsThunk(types, sc));
            }
            UTC.setExtensions(typeDef.extensions);
            if (Array.isArray(typeDef?.directives)) {
                UTC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide GraphQLUnionTypeConfig or string with union name or SDL definition. Provided:\n${inspect(typeDef)}`);
        }
        return UTC;
    }
    constructor(graphqlType, schemaComposer) {
        this._gqcFallbackResolveType = null;
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new UnionTypeComposer(GraphQLUnionType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLUnionType)) {
            throw new Error('UnionTypeComposer accept only GraphQLUnionType in constructor. Try to use more flexible method `UnionTypeComposer.create()`.');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        this.schemaComposer.set(graphqlType.name, this);
        let types = [];
        if (graphqlVersion >= 14) {
            types = this._gqType._types;
        }
        else {
            types = this._gqType._types || this._gqType._typeConfig.types;
        }
        types = convertObjectTypeArrayAsThunk(types, this.schemaComposer);
        this._gqcTypes = new Set();
        types.forEach((type) => {
            this._gqcTypes.add(type);
        });
        this._gqcTypeResolvers = new Map();
        if (!this._gqType.astNode) {
            this._gqType.astNode = getUnionTypeDefinitionNode(this);
        }
        this._gqcIsModified = false;
    }
    hasType(name) {
        const typeName = getComposeTypeName(name, this.schemaComposer);
        for (const type of this._gqcTypes) {
            if (type.getTypeName() === typeName) {
                return true;
            }
        }
        return false;
    }
    getTypes() {
        return Array.from(this._gqcTypes.values());
    }
    getTypeComposers() {
        return this.getTypes().map((t) => unwrapOutputTC(t));
    }
    getTypeNames() {
        return this.getTypes().map((t) => t.getTypeName());
    }
    clearTypes() {
        this._gqcTypes.clear();
        this._gqcIsModified = true;
        return this;
    }
    setTypes(types) {
        const tcs = convertObjectTypeArrayAsThunk(types, this.schemaComposer);
        this._gqcTypes = new Set(tcs);
        this._gqcIsModified = true;
        return this;
    }
    addType(type) {
        const tc = this._convertObjectType(type);
        this.removeType(tc.getTypeName());
        this._gqcTypes.add(tc);
        this._gqcIsModified = true;
        return this;
    }
    addTypes(types) {
        if (!Array.isArray(types)) {
            throw new Error(`UnionTypeComposer[${this.getTypeName()}].addType() accepts only array`);
        }
        types.forEach((type) => this.addType(type));
        return this;
    }
    removeType(nameOrArray) {
        const typeNames = Array.isArray(nameOrArray) ? nameOrArray : [nameOrArray];
        typeNames.forEach((typeName) => {
            for (const type of this._gqcTypes) {
                if (type.getTypeName() === typeName) {
                    this._gqcTypes.delete(type);
                    this._gqcIsModified = true;
                }
            }
        });
        return this;
    }
    removeOtherTypes(nameOrArray) {
        const keepTypeNames = Array.isArray(nameOrArray) ? nameOrArray : [nameOrArray];
        for (const type of this._gqcTypes) {
            if (keepTypeNames.indexOf(type.getTypeName()) === -1) {
                this._gqcTypes.delete(type);
                this._gqcIsModified = true;
            }
        }
        return this;
    }
    getType() {
        if (this._gqcIsModified) {
            this._gqcIsModified = false;
            this._gqType.astNode = getUnionTypeDefinitionNode(this);
            const prepareTypes = () => {
                try {
                    return this.getTypes().map((tc) => tc.getType());
                }
                catch (e) {
                    e.message = `UnionError[${this.getTypeName()}]: ${e.message}`;
                    throw e;
                }
            };
            if (graphqlVersion >= 14) {
                this._gqType._types = prepareTypes;
            }
            else {
                this._gqType._types = null;
                this._gqType._typeConfig.types = prepareTypes;
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
            throw new Error('You should provide newTypeName:string for UnionTypeComposer.clone()');
        }
        const cloned = newTypeNameOrTC instanceof UnionTypeComposer
            ? newTypeNameOrTC
            : UnionTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned._gqcTypes = new Set(this._gqcTypes);
        cloned._gqcTypeResolvers = new Map(this._gqcTypeResolvers);
        cloned._gqcFallbackResolveType = this._gqcFallbackResolveType;
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        return cloned;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        if (!anotherSchemaComposer) {
            throw new Error('You should provide SchemaComposer for ObjectTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return this;
        const cloned = UnionTypeComposer.create(this.getTypeName(), anotherSchemaComposer);
        cloneMap.set(this, cloned);
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
        const types = this.getTypes();
        if (types.length > 0) {
            cloned.setTypes(types.map((tc) => cloneTypeTo(tc, anotherSchemaComposer, cloneMap)));
        }
        return cloned;
    }
    merge(type) {
        let tc;
        if (type instanceof GraphQLUnionType) {
            tc = UnionTypeComposer.createTemp(type, this.schemaComposer);
        }
        else if (type instanceof UnionTypeComposer) {
            tc = type;
        }
        else {
            throw new Error(`Cannot merge ${inspect(type)} with UnionType(${this.getTypeName()}). Provided type should be GraphQLUnionType or UnionTypeComposer.`);
        }
        this.addTypes(tc.getTypes().map((t) => t.getTypeName()));
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
        const tc = this._convertObjectType(type);
        return typeResolversMap.has(tc);
    }
    getTypeResolvers() {
        return this._gqcTypeResolvers;
    }
    getTypeResolverCheckFn(type) {
        const typeResolversMap = this.getTypeResolvers();
        const tc = this._convertObjectType(type);
        if (!typeResolversMap.has(tc)) {
            throw new Error(`Type resolve function in union '${this.getTypeName()}' is not defined for type ${inspect(type)}.`);
        }
        return typeResolversMap.get(tc);
    }
    getTypeResolverNames() {
        const typeResolversMap = this.getTypeResolvers();
        const names = [];
        typeResolversMap.forEach((_, tc) => {
            names.push(tc.getTypeName());
        });
        return names;
    }
    getTypeResolverTypes() {
        const typeResolversMap = this.getTypeResolvers();
        return Array.from(typeResolversMap.keys());
    }
    setTypeResolvers(typeResolversMap) {
        this._gqcTypeResolvers = this._convertTypeResolvers(typeResolversMap);
        this._gqcIsModified = true;
        this._initResolveTypeFn();
        return this;
    }
    _initResolveTypeFn() {
        const fallbackType = this._gqcFallbackResolveType
            ? getGraphQLType(this._gqcFallbackResolveType)
            : undefined;
        const fastEntries = [];
        if (graphqlVersion >= 16) {
            for (const [composeType, checkFn] of this._gqcTypeResolvers.entries()) {
                fastEntries.push([getComposeTypeName(composeType, this.schemaComposer), checkFn]);
                this.addType(composeType);
            }
        }
        else {
            for (const [composeType, checkFn] of this._gqcTypeResolvers.entries()) {
                fastEntries.push([getGraphQLType(composeType), checkFn]);
                this.addType(composeType);
            }
        }
        let resolveType;
        const isAsyncRuntime = this._isTypeResolversAsync(this._gqcTypeResolvers);
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
    _convertObjectType(type) {
        const tc = this.schemaComposer.typeMapper.convertOutputTypeDefinition(type);
        if (tc instanceof ObjectTypeComposer || tc instanceof ThunkComposer) {
            return tc;
        }
        throw new Error(`Should be provided ObjectType but received ${inspect(type)}`);
    }
    _convertTypeResolvers(typeResolversMap) {
        if (!(typeResolversMap instanceof Map)) {
            throw new Error(`For union ${this.getTypeName()} you should provide Map object for type resolvers.`);
        }
        const result = new Map();
        for (const [composeType, checkFn] of typeResolversMap.entries()) {
            try {
                result.set(this._convertObjectType(composeType), checkFn);
            }
            catch (e) {
                throw new Error(`For union type resolver ${this.getTypeName()} you must provide GraphQLObjectType or ObjectTypeComposer, but provided ${inspect(composeType)}`);
            }
            if (!isFunction(checkFn)) {
                throw new Error(`Union ${this.getTypeName()} has invalid check function for type ${inspect(composeType)}`);
            }
        }
        return result;
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
        const tc = this._convertObjectType(type);
        typeResolversMap.set(tc, checkFn);
        this.schemaComposer.addSchemaMustHaveType(tc);
        this.setTypeResolvers(typeResolversMap);
        return this;
    }
    removeTypeResolver(type) {
        const typeResolversMap = this.getTypeResolvers();
        const tc = this._convertObjectType(type);
        typeResolversMap.delete(tc);
        this.setTypeResolvers(typeResolversMap);
        return this;
    }
    setTypeResolverFallback(type) {
        if (type) {
            this.addType(type);
            this.schemaComposer.addSchemaMustHaveType(type);
        }
        this._gqcFallbackResolveType = type;
        this._gqcIsModified = true;
        this._initResolveTypeFn();
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
    getNestedTCs(opts = {}, passedTypes = new Set()) {
        const exclude = Array.isArray(opts.exclude) ? opts.exclude : [];
        this.getTypeComposers().forEach((tc) => {
            if (!passedTypes.has(tc) && !exclude.includes(tc.getTypeName())) {
                passedTypes.add(tc);
                if (tc instanceof ObjectTypeComposer) {
                    tc.getNestedTCs(opts, passedTypes);
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
            r += printUnion(this.getType(), innerOpts);
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
        return printUnion(this.getType(), innerOpts);
    }
}