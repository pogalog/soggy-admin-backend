"use strict";

function buildCommissionSelectClause() {
  return `
    SELECT
      id,
      submission_key,
      item_name,
      item_description,
      yarn_type,
      yarn_color,
      attachment_material_type,
      storage_bucket,
      upload_directory,
      storage_images,
      meta_path,
      signed_url_expires_at,
      prepared_at,
      status,
      commitment_deposit_amount,
      time_cost,
      ship_date,
      total_cost,
      requires_commit,
      created_at,
      updated_at
    FROM commissions
  `;
}

async function listCommissions(pool, filters) {
  const conditions = [];
  const values = [];
  let parameterIndex = 1;

  if (filters.id) {
    conditions.push(`id = $${parameterIndex}`);
    values.push(filters.id);
    parameterIndex += 1;
  }

  if (filters.submissionKey) {
    conditions.push(`submission_key = $${parameterIndex}`);
    values.push(filters.submissionKey);
    parameterIndex += 1;
  }

  if (filters.itemName) {
    conditions.push(`item_name = $${parameterIndex}`);
    values.push(filters.itemName);
    parameterIndex += 1;
  }

  if (filters.yarnType) {
    conditions.push(`yarn_type = $${parameterIndex}`);
    values.push(filters.yarnType);
    parameterIndex += 1;
  }

  if (filters.yarnColor) {
    conditions.push(`yarn_color = $${parameterIndex}`);
    values.push(filters.yarnColor);
    parameterIndex += 1;
  }

  if (filters.attachmentMaterialType) {
    conditions.push(`attachment_material_type = $${parameterIndex}`);
    values.push(filters.attachmentMaterialType);
    parameterIndex += 1;
  }

  if (filters.status === "open") {
    conditions.push("status <> 'closed'");
  } else if (filters.status) {
    conditions.push(`status = $${parameterIndex}`);
    values.push(filters.status);
    parameterIndex += 1;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `
      ${buildCommissionSelectClause()}
      ${whereClause}
      ORDER BY created_at DESC, id ASC
    `,
    values
  );

  return result.rows;
}

async function updateCommissionById(pool, commission) {
  const assignments = [];
  const values = [commission.id];
  let parameterIndex = 2;

  if (commission.hasTimeCost) {
    assignments.push(`time_cost = $${parameterIndex}`);
    values.push(commission.timeCost);
    parameterIndex += 1;
  }

  if (commission.hasShipDate) {
    assignments.push(`ship_date = $${parameterIndex}`);
    values.push(commission.shipDate);
    parameterIndex += 1;
  }

  if (commission.hasTotalCost) {
    assignments.push(`total_cost = $${parameterIndex}`);
    values.push(commission.totalCost);
    parameterIndex += 1;
  }

  if (commission.hasCommitmentDepositAmount) {
    assignments.push(`commitment_deposit_amount = $${parameterIndex}`);
    values.push(commission.commitmentDepositAmount);
    parameterIndex += 1;
  }

  if (commission.hasStatus) {
    assignments.push(`status = $${parameterIndex}`);
    values.push(commission.status);
    parameterIndex += 1;
  }

  if (commission.hasRequiresCommit) {
    assignments.push(`requires_commit = $${parameterIndex}`);
    values.push(commission.requiresCommit);
    parameterIndex += 1;
  }

  assignments.push("updated_at = NOW()");

  const result = await pool.query(
    `
      UPDATE commissions
      SET ${assignments.join(", ")}
      WHERE id = $1
      RETURNING
        id,
        submission_key,
        item_name,
        item_description,
        yarn_type,
        yarn_color,
        attachment_material_type,
        storage_bucket,
        upload_directory,
        storage_images,
        meta_path,
        signed_url_expires_at,
        prepared_at,
        status,
        commitment_deposit_amount,
        time_cost,
        ship_date,
        total_cost,
        requires_commit,
        created_at,
        updated_at
    `,
    values
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function deleteCommissionById(pool, commissionId) {
  const result = await pool.query(
    `
      DELETE FROM commissions
      WHERE id = $1
    `,
    [commissionId]
  );

  return result.rowCount > 0;
}

module.exports = {
  deleteCommissionById,
  listCommissions,
  updateCommissionById
};
