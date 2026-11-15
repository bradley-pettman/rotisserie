import type { ImportAttemptSchemas } from '@rotisserie/shared/recipes'
import { DB } from '~/db/connection'
import { isoTimestamp } from './sql'

type ImportAttempt = ImportAttemptSchemas['ImportAttempt']

export async function insertImportAttempt(
  householdId: string,
  attempt: ImportAttemptSchemas['RecordImportAttemptInput'] & { userId: string; host: string }
): Promise<void> {
  await DB.query(
    `INSERT INTO recipe_import_attempts (household_id, user_id, url, host, outcome, http_status, missing_fields)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[])`,
    [householdId, attempt.userId, attempt.url, attempt.host, attempt.outcome, attempt.httpStatus, attempt.missingFields]
  )
}

export async function listImportAttempts(
  householdId: string,
  { outcome, limit }: ImportAttemptSchemas['ListImportAttemptsQuery']
): Promise<ImportAttempt[]> {
  return DB.query<ImportAttempt>(
    `SELECT
       id,
       url,
       host,
       outcome,
       http_status AS "httpStatus",
       missing_fields AS "missingFields",
       ${isoTimestamp('created_at')} AS "createdAt"
     FROM recipe_import_attempts
     WHERE household_id = $1 AND ($2::text IS NULL OR outcome = $2)
     ORDER BY created_at DESC, id
     LIMIT $3`,
    [householdId, outcome ?? null, limit]
  )
}
