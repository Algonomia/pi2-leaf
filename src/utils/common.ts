import {Matrix} from "mathjs";
import {Entity, OwnershipOut} from "~/controllers/scope/scope.interface";

export const reverseMapping = (o: Map<any, any>): Map<any, any[]> => {
    const result = new Map<any, any>();
    o.forEach((val, key) => {
        if (!result.has(val)) {
            result.set(val, [key]);
        } else {
            result.get(val).push(key);
        }
    });
    return result;
}

export function getValueFromKeyIfTypeCompatibleMandatory<T>(key: string, jsonObject: {[key: string]: any}, type: any, defaultValue?: T): T {
    if (!jsonObject.hasOwnProperty(key)) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error('Missing key "' + key + '" in input');
    }
    return <T>getValueFromKeyIfTypeCompatible<T>(key, jsonObject, type);
}

export function getValueFromKeyIfTypeCompatible<T>(key: string, jsonObject: {[key: string]: any}, type: any): T|undefined {
    if (jsonObject[key] === undefined) {
        return undefined;
    }
    if (typeof type !== 'function') {
        if (typeof jsonObject[key] !== type) {
            try {
                if (type === 'number') {
                    const ret = Number(jsonObject[key]);
                    if (isNaN(ret)) { throw new Error(); }
                    return <T><unknown>ret;
                }
                if (type === 'boolean') {
                    const ret = Boolean(JSON.parse(typeof jsonObject[key] === 'string' ?
                        (jsonObject[key].toLowerCase() === '' ? 'false' : jsonObject[key].toLowerCase()) :
                        jsonObject[key]));
                    return <T><unknown>ret;
                }
                if (typeof type === 'object') {
                    if (Object.values(type).slice(Object.values(type).length / 2).every(value => typeof value === 'number')) {
                        const ret = Number(jsonObject[key]);
                        if (isNaN(ret)) { throw new Error(); }
                        return <T><unknown>ret;
                    }
                }
            } catch (e) {
                throw new Error('Wrong type for key "' + key + '", should be: ' + type);
            }
        }
    } else if (!(jsonObject[key] instanceof type)) {
        try {
            if (type === Date) {
                let val = jsonObject[key];
                if (!isNaN(Number(val))) {
                    val = Number(val);
                }
                const ret = new Date(val);
                if (isNaN(ret.getTime())) { throw new Error(); }
                return <T><unknown>ret;
            }
        } catch (e) {
            throw new Error('Wrong type for key "' + key + '", should be: ' + type);
        }
    }
    return <T>jsonObject[key];
}

export interface OwnershipLike {owner: string, subsidiary_group_entity: string};

export function matrixToOwnershipLikeOut<T extends OwnershipLike>(matrix: Matrix, key: keyof T, ownershipOuts: Map<string, OwnershipLike>, entityList: Entity[], filterValue = 0) {
    // @ts-ignore
    matrix.forEach((value, index:  [number, number]) => {
        if (value !== filterValue && entityList[index[0]] && entityList[index[1]]) {
            const k = index[0].toString() + '|' + index[1].toString();
            if (!ownershipOuts.has(k)) {
                ownershipOuts.set(k, {
                    owner: entityList[index[0]].entity_id,
                    subsidiary_group_entity: entityList[index[1]].entity_id
                });
            }
            // @ts-ignore
            ownershipOuts.get(k)[key] = value;
        }
    });
}
