import { GraphQLList } from 'graphql';
import { isNamedTypeComposer } from './utils/typeHelpers';
import { NonNullComposer } from './NonNullComposer';
export class ListComposer {
    constructor(type) {
        this.ofType = type;
    }
    getType() {
        return new GraphQLList(this.ofType.getType());
    }
    getTypeName() {
        return `[${this.ofType.getTypeName()}]`;
    }
    getUnwrappedTC() {
        let tc = this;
        while (!isNamedTypeComposer(tc)) {
            tc = tc.ofType;
        }
        return tc;
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
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        return new ListComposer(this.ofType.cloneTo(anotherSchemaComposer, cloneMap));
    }
}
