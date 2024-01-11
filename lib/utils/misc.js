import { isObject } from './is';
import { pluralize } from './pluralize';
export function resolveMaybeThunk(thingOrThunk) {
    return typeof thingOrThunk === 'function' ? thingOrThunk() : thingOrThunk;
}
export function camelCase(str) {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => index === 0 ? letter.toLowerCase() : letter.toUpperCase())
        .replace(/\s+/g, '');
}
export function getPluralName(name) {
    return pluralize(camelCase(name));
}
export function upperFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
export function clearName(str) {
    return str.replace(/[^_a-zA-Z0-9]/g, '');
}
export function omit(obj, keys) {
    if (!obj) {
        return {};
    }
    const result = { ...obj };
    if (Array.isArray(keys)) {
        keys.forEach((k) => {
            delete result[k];
        });
    }
    else {
        delete result[keys];
    }
    return result;
}
export function only(obj, keys) {
    if (!obj) {
        return {};
    }
    const result = {};
    if (Array.isArray(keys)) {
        keys.forEach((k) => {
            if ({}.hasOwnProperty.call(obj, k)) {
                result[k] = obj[k];
            }
        });
    }
    else if ({}.hasOwnProperty.call(obj, keys)) {
        result[keys] = obj[keys];
    }
    return result;
}
function inspectObject(value) {
    let name;
    if (value && value.constructor && value.constructor.name) {
        name = value.constructor.name;
    }
    const props = `{ ${Object.keys(value)
        .filter((n) => n !== 'loc')
        .map((k) => `${k}: ${inspect(value[k])}`)
        .join(', ')} }`;
    return name ? `${name}(${props})` : props;
}
export function inspect(value) {
    return value && typeof value === 'object'
        ? typeof value.inspect === 'function'
            ? value.inspect()
            : Array.isArray(value)
                ? `[${value.map(inspect).join(', ')}]`
                : inspectObject(value)
        : typeof value === 'string'
            ? `"${value}"`
            : typeof value === 'function'
                ? `[function ${value.name}]`
                : String(value);
}
export function forEachKey(obj, callback) {
    Object.keys(obj).forEach((key) => {
        callback(obj[key], key);
    });
}
export function mapEachKey(obj, callback) {
    if (!isObject(obj))
        return obj;
    const result = {};
    Object.keys(obj).forEach((key) => {
        result[key] = callback(obj[key], key);
    });
    return result;
}
export function keyValMap(list, keyFn, valFn) {
    const result = Object.create(null);
    for (const item of list) {
        result[keyFn(item)] = valFn(item);
    }
    return result;
}
export function keyMap(list, keyFn) {
    const result = Object.create(null);
    for (const item of list) {
        result[keyFn(item)] = item;
    }
    return result;
}
export function invariant(condition, message) {
    const booleanCondition = Boolean(condition);
    if (!booleanCondition) {
        throw new Error(message != null ? message : 'Unexpected invariant triggered.');
    }
}
