import { GraphQLScalarType, valueFromASTUntyped } from 'graphql';
import { isObject, isString } from './utils/is';
import { SchemaComposer } from './SchemaComposer';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { isTypeNameString } from './utils/typeHelpers';
import { inspect } from './utils/misc';
import { graphqlVersion } from './utils/graphqlVersion';
import { printScalar } from './utils/schemaPrinter';
import { getScalarTypeDefinitionNode } from './utils/definitionNode';
export class ScalarTypeComposer {
    static create(typeDef, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `ScalarTypeComposer.create(typeDef, schemaComposer)`');
        }
        if (schemaComposer.hasInstance(typeDef, ScalarTypeComposer)) {
            return schemaComposer.getSTC(typeDef);
        }
        const stc = this.createTemp(typeDef, schemaComposer);
        schemaComposer.add(stc);
        return stc;
    }
    static createTemp(typeDef, schemaComposer) {
        const sc = schemaComposer || new SchemaComposer();
        let STC;
        if (isString(typeDef)) {
            const typeName = typeDef;
            if (isTypeNameString(typeName)) {
                STC = new ScalarTypeComposer(new GraphQLScalarType({
                    name: typeName,
                    serialize: () => { },
                }), sc);
            }
            else {
                STC = sc.typeMapper.convertSDLTypeDefinition(typeName);
                if (!(STC instanceof ScalarTypeComposer)) {
                    throw new Error('You should provide correct GraphQLScalarType type definition. Eg. `scalar UInt`');
                }
            }
        }
        else if (typeDef instanceof GraphQLScalarType) {
            STC = new ScalarTypeComposer(typeDef, sc);
        }
        else if (isObject(typeDef)) {
            const type = new GraphQLScalarType({
                ...typeDef,
            });
            STC = new ScalarTypeComposer(type, sc);
            STC.setExtensions(typeDef.extensions);
            if (Array.isArray(typeDef?.directives)) {
                STC.setDirectives(typeDef.directives);
            }
        }
        else {
            throw new Error(`You should provide GraphQLScalarTypeConfig or string with scalar name or SDL. Provided:\n${inspect(typeDef)}`);
        }
        return STC;
    }
    constructor(graphqlType, schemaComposer) {
        if (!(schemaComposer instanceof SchemaComposer)) {
            throw new Error('You must provide SchemaComposer instance as a second argument for `new ScalarTypeComposer(GraphQLScalarType, SchemaComposer)`');
        }
        if (!(graphqlType instanceof GraphQLScalarType)) {
            throw new Error('ScalarTypeComposer accept only GraphQLScalarType in constructor');
        }
        this.schemaComposer = schemaComposer;
        this._gqType = graphqlType;
        this.schemaComposer.set(graphqlType, this);
        this.schemaComposer.set(graphqlType.name, this);
        let serialize;
        let parseValue;
        let parseLiteral;
        if (graphqlVersion >= 14) {
            serialize = this._gqType.serialize;
            parseValue = this._gqType.parseValue;
            parseLiteral = this._gqType.parseLiteral;
        }
        else {
            serialize = this._gqType._scalarConfig.serialize;
            parseValue = this._gqType._scalarConfig.parseValue;
            parseLiteral = this._gqType._scalarConfig.parseLiteral;
        }
        this.setSerialize(serialize);
        this.setParseValue(parseValue);
        this.setParseLiteral(parseLiteral);
        if (this._gqType.specifiedByUrl) {
            this.setDirectiveByName('specifiedBy', { url: this._gqType.specifiedByUrl });
        }
        if (this._gqType.specifiedByURL) {
            this.setDirectiveByName('specifiedBy', { url: this._gqType.specifiedByURL });
        }
        if (!this._gqType.astNode) {
            this._gqType.astNode = getScalarTypeDefinitionNode(this);
        }
        this._gqcIsModified = false;
    }
    setSerialize(fn) {
        this._gqcSerialize = fn;
        this._gqcIsModified = true;
        return this;
    }
    getSerialize() {
        return this._gqcSerialize;
    }
    setParseValue(fn) {
        this._gqcParseValue = fn || ((value) => value);
        this._gqcIsModified = true;
        return this;
    }
    getParseValue() {
        return this._gqcParseValue;
    }
    setParseLiteral(fn) {
        this._gqcParseLiteral = fn || valueFromASTUntyped;
        this._gqcIsModified = true;
        return this;
    }
    getParseLiteral() {
        return this._gqcParseLiteral;
    }
    getType() {
        if (this._gqcIsModified) {
            this._gqcIsModified = false;
            this._gqType.astNode = getScalarTypeDefinitionNode(this);
            if (graphqlVersion >= 14) {
                this._gqType.specifiedByUrl = this.getSpecifiedByUrl();
                this._gqType.specifiedByURL = this.getSpecifiedByUrl();
                this._gqType.serialize = this._gqcSerialize;
                this._gqType.parseValue = this._gqcParseValue;
                this._gqType.parseLiteral = this._gqcParseLiteral;
            }
            else {
                this._gqType._scalarConfig = {
                    ...this._gqType._scalarConfig,
                    serialize: this._gqcSerialize,
                    parseValue: this._gqcParseValue,
                    parseLiteral: this._gqcParseLiteral,
                };
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
    getSpecifiedByUrl() {
        return this.getDirectiveByName('specifiedBy')?.url;
    }
    setSpecifiedByUrl(url) {
        this.setDirectiveByName('specifiedBy', { url });
        return this;
    }
    clone(newTypeNameOrTC) {
        if (!newTypeNameOrTC) {
            throw new Error('You should provide newTypeName:string for ScalarTypeComposer.clone()');
        }
        const cloned = newTypeNameOrTC instanceof ScalarTypeComposer
            ? newTypeNameOrTC
            : ScalarTypeComposer.create(newTypeNameOrTC, this.schemaComposer);
        cloned._gqcSerialize = this._gqcSerialize;
        cloned._gqcParseValue = this._gqcParseValue;
        cloned._gqcParseLiteral = this._gqcParseLiteral;
        cloned._gqcExtensions = { ...this._gqcExtensions };
        cloned.setDescription(this.getDescription());
        cloned.setDirectives(this.getDirectives());
        return cloned;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        if (!anotherSchemaComposer) {
            throw new Error('You should provide SchemaComposer for ObjectTypeComposer.cloneTo()');
        }
        if (cloneMap.has(this))
            return cloneMap.get(this);
        cloneMap.set(this, this);
        if (!anotherSchemaComposer.has(this.getTypeName())) {
            anotherSchemaComposer.add(this);
        }
        return this;
    }
    merge(type) {
        let tc;
        if (type instanceof GraphQLScalarType) {
            tc = ScalarTypeComposer.createTemp(type, this.schemaComposer);
        }
        else if (type instanceof ScalarTypeComposer) {
            tc = type;
        }
        if (tc) {
            this.setSerialize(tc.getSerialize());
            this.setParseValue(tc.getParseValue());
            this.setParseLiteral(tc.getParseLiteral());
        }
        else {
            throw new Error(`Cannot merge ${inspect(type)} with ScalarType(${this.getTypeName()}). Provided type should be GraphQLScalarType or ScalarTypeComposer.`);
        }
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
    toSDL(opts) {
        return printScalar(this.getType(), opts);
    }
}
