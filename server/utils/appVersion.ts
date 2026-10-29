import logger from '@server/logger';
import { existsSync } from 'fs';
import path from 'path';

const COMMIT_TAG_PATH = path.join(__dirname, '../../committag.json');
let commitTag = 'local';
let buildDate = '';

if (existsSync(COMMIT_TAG_PATH)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const buildInfo = require(COMMIT_TAG_PATH);
  commitTag = buildInfo.commitTag;
  buildDate = buildInfo.buildDate ?? '';
  logger.info(`Commit Tag: ${commitTag}`);
}

export const getCommitTag = (): string => {
  return commitTag;
};

export const getBuildDate = (): string => {
  return buildDate;
};

export const getAppVersion = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { version } = require('../../package.json');

  let finalVersion = version;

  if (version === '0.1.0') {
    finalVersion = `develop-${getCommitTag()}`;
  }

  return finalVersion;
};
