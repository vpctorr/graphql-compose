import { isFunction } from './utils/is';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { inspect } from './utils/misc';
export class ThunkComposer {
    get ofType() {
        if (!this._typeFromThunk) {
            this._typeFromThunk = this._thunk();
        }
        if (!this._typeFromThunk) {
            throw new Error(`ThunkComposer(${this._typeName || ''}) returns empty value: ${inspect(this._typeFromThunk)}`);
        }
        return this._typeFromThunk;
    }
    constructor(thunk, typeName) {
        this._thunk = thunk;
        if (typeName && typeof typeName === 'string') {
            this._typeName = typeName;
        }
    }
    getUnwrappedTC() {
        return this.ofType;
    }
    getType() {
        return this.ofType.getType();
    }
    getTypeName() {
        if (this._typeFromThunk && isFunction(this._typeFromThunk.getTypeName)) {
            return this._typeFromThunk.getTypeName();
        }
        else if (this._typeName) {
            return this._typeName;
        }
        return this.getUnwrappedTC().getTypeName();
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
        const cloned = this.ofType.cloneTo(anotherSchemaComposer, cloneMap);
        return new ThunkComposer(() => cloned, this._typeName);
    }
}
