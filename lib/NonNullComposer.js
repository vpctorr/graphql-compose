import { GraphQLNonNull } from 'graphql';
import { isNamedTypeComposer } from './utils/typeHelpers';
import { ListComposer } from './ListComposer';
import { invariant } from './utils/misc';
export class NonNullComposer {
    constructor(type) {
        invariant(!(type instanceof NonNullComposer), 'You provide NonNull value to NonNullComposer constructor. Nesting NonNull is not allowed.');
        this.ofType = type;
    }
    getType() {
        return new GraphQLNonNull(this.ofType.getType());
    }
    getTypeName() {
        return `${this.ofType.getTypeName()}!`;
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
        return this;
    }
    get List() {
        return new ListComposer(this);
    }
    get NonNull() {
        return this;
    }
    cloneTo(anotherSchemaComposer, cloneMap = new Map()) {
        return new NonNullComposer(this.ofType.cloneTo(anotherSchemaComposer, cloneMap));
    }
}
