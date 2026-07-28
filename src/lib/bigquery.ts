import 'server-only';

import { BigQuery, type Query } from '@google-cloud/bigquery';

const DEFAULT_PROJECT_ID = 'bici-klaviyo-datasync';
const DEFAULT_DATASET_ID = 'Biciserialtracker';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const configuredDataset =
  process.env.BIGQUERY_DATASET_ID || DEFAULT_DATASET_ID;
const datasetParts = configuredDataset.split('.');

export const bigQueryProjectId =
  process.env.BIGQUERY_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  (datasetParts.length === 2 ? datasetParts[0] : '') ||
  DEFAULT_PROJECT_ID;

export const bigQueryDatasetId =
  datasetParts.length === 2 ? datasetParts[1] : configuredDataset;

for (const [name, value] of [
  ['BigQuery project', bigQueryProjectId],
  ['BigQuery dataset', bigQueryDatasetId],
] as const) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${name} contains unsupported characters.`);
  }
}

export const bigquery = new BigQuery({
  projectId: bigQueryProjectId,
});

export function tableRef(
  table: 'collections' | 'serial_mapping_rules' | 'serial_scans',
) {
  return `\`${bigQueryProjectId}.${bigQueryDatasetId}.${table}\``;
}

export async function queryRows<T>(
  query: string,
  params: Query['params'] = {},
) {
  const [rows] = await bigquery.query({
    query,
    params,
    useLegacySql: false,
  });
  return rows as T[];
}

export async function executeDml(
  query: string,
  params: Query['params'] = {},
) {
  const [job] = await bigquery.createQueryJob({
    query,
    params,
    useLegacySql: false,
  });
  await job.getQueryResults();
  const [metadata] = await job.getMetadata();
  const affected = metadata.statistics?.query?.numDmlAffectedRows;
  return affected === undefined ? null : Number(affected);
}
