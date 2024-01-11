import { versionInfo } from 'graphql';
export function getGraphqlVersion() {
    if (versionInfo?.major) {
        return parseFloat(`${versionInfo?.major}.${versionInfo?.minor}`);
    }
    else {
        return 14.0;
    }
}
export const graphqlVersion = getGraphqlVersion();
