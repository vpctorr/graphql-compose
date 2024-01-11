/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable global-require */

import { versionInfo } from 'graphql';
export function getGraphqlVersion(): number {
  if (versionInfo?.major) {
    return parseFloat(`${versionInfo?.major}.${versionInfo?.minor}`);
  } else {
    return 14.0;
  }
}

export const graphqlVersion = getGraphqlVersion();
