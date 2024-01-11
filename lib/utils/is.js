export function isString(value) {
    return typeof value === 'string';
}
export function isObject(value) {
    return typeof value === 'object' && !Array.isArray(value) && value !== null;
}
export function isFunction(value) {
    return !!(value &&
        value.constructor &&
        value.call &&
        typeof value === 'function' &&
        value.apply);
}
