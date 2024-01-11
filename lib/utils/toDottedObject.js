export function toDottedObject(obj, target = {}, path = []) {
    Object.keys(obj).forEach((key) => {
        if (Object(obj[key]) === obj[key]) {
            toDottedObject(obj[key], target, path.concat(key));
        }
        else {
            target[path.concat(key).join('.')] = obj[key];
        }
    });
    return target;
}
