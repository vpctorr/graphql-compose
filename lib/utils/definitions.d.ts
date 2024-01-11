export type ObjMap<T> = Record<string, T>;
export type ObjMapReadOnly<T> = Readonly<Record<string, Readonly<T>>>;
export type MaybePromise<T> = Promise<T> | T;
export type Thunk<T> = (() => any) | T;
export type ThunkWithSchemaComposer<T, SC> = ((schemaComposer: SC) => T) | T;
export type DirectiveArgs = {
    [key: string]: any;
};
export type Directive = {
    name: string;
    args?: DirectiveArgs;
};
export type Extensions = {
    [key: string]: any;
    directives?: Directive[];
};
