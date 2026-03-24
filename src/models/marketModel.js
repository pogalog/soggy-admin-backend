"use strict";

function withStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function selectMarketColumns(alias) {
  const prefix = alias ? `${alias}.` : "";
  return `
    ${prefix}ctid::text AS row_ref,
    ${prefix}street_address,
    ${prefix}city,
    ${prefix}state,
    ${prefix}start_time,
    ${prefix}end_time,
    ${prefix}title,
    ${prefix}description,
    ${prefix}link
  `;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function toIsoStringOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toUtcDateKey(value) {
  const isoString = toIsoStringOrNull(value);
  return isoString ? isoString.slice(0, 10) : null;
}

function marketHasEnded(value) {
  const isoString = toIsoStringOrNull(value);
  return isoString ? new Date(isoString).getTime() < Date.now() : false;
}

function buildComparableRow(row) {
  return {
    street_address: normalizeOptionalString(row.street_address),
    city: normalizeOptionalString(row.city),
    state: normalizeOptionalString(row.state),
    start_time: toIsoStringOrNull(row.start_time),
    end_time: toIsoStringOrNull(row.end_time),
    title: normalizeOptionalString(row.title),
    description: normalizeOptionalString(row.description),
    link: normalizeOptionalString(row.link)
  };
}

function buildComparableMarket(market) {
  return {
    street_address: market.streetAddress,
    city: market.city,
    state: market.state,
    start_time: market.startTime,
    end_time: market.endTime,
    title: market.title,
    description: market.description,
    link: market.link
  };
}

function marketsEqual(row, market) {
  const existing = buildComparableRow(row);
  const incoming = buildComparableMarket(market);

  return (
    existing.street_address === incoming.street_address &&
    existing.city === incoming.city &&
    existing.state === incoming.state &&
    existing.start_time === incoming.start_time &&
    existing.end_time === incoming.end_time &&
    existing.title === incoming.title &&
    existing.description === incoming.description &&
    existing.link === incoming.link
  );
}

function buildMarketRowFromRequest(market) {
  return {
    street_address: market.streetAddress,
    city: market.city,
    state: market.state,
    start_time: market.startTime,
    end_time: market.endTime,
    title: market.title,
    description: market.description,
    link: market.link
  };
}

function matchMarketCandidates(rows, market) {
  const exactMatches = rows.filter(
    (row) => toIsoStringOrNull(row.start_time) === market.startTime
  );

  if (exactMatches.length > 1) {
    throw withStatusError(
      "Multiple market rows matched this event exactly; unable to determine which row to update",
      409
    );
  }

  if (exactMatches.length === 1) {
    return {
      matchedOn: "exact_start_time",
      row: exactMatches[0]
    };
  }

  const incomingDateKey = toUtcDateKey(market.startTime);
  const sameDayMatches = rows.filter(
    (row) => toUtcDateKey(row.start_time) === incomingDateKey
  );

  if (sameDayMatches.length > 1) {
    throw withStatusError(
      "Multiple market rows matched this event on the same day; unable to determine which row to update",
      409
    );
  }

  if (sameDayMatches.length === 1) {
    return {
      matchedOn: "same_day_identity",
      row: sameDayMatches[0]
    };
  }

  return {
    matchedOn: "none",
    row: null
  };
}

async function findMatchingMarket(client, market) {
  const result = await client.query(
    `
      SELECT
        ${selectMarketColumns("m")}
      FROM markets m
      WHERE lower(btrim(m.title)) = lower(btrim($1))
        AND lower(btrim(m.street_address)) = lower(btrim($2))
        AND lower(btrim(m.city)) = lower(btrim($3))
        AND lower(btrim(m.state)) = lower(btrim($4))
      ORDER BY m.start_time ASC, m.end_time ASC NULLS LAST
    `,
    [market.title, market.streetAddress, market.city, market.state]
  );

  return matchMarketCandidates(result.rows, market);
}

async function insertMarket(client, market) {
  const result = await client.query(
    `
      INSERT INTO markets (
        street_address,
        city,
        state,
        start_time,
        end_time,
        title,
        description,
        link
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        ${selectMarketColumns()}
    `,
    [
      market.streetAddress,
      market.city,
      market.state,
      market.startTime,
      market.endTime,
      market.title,
      market.description,
      market.link
    ]
  );

  return result.rows[0];
}

async function updateMarketByRowRef(client, rowRef, market) {
  const result = await client.query(
    `
      UPDATE markets
      SET
        street_address = $2,
        city = $3,
        state = $4,
        start_time = $5,
        end_time = $6,
        title = $7,
        description = $8,
        link = $9
      WHERE ctid::text = $1
      RETURNING
        ${selectMarketColumns()}
    `,
    [
      rowRef,
      market.streetAddress,
      market.city,
      market.state,
      market.startTime,
      market.endTime,
      market.title,
      market.description,
      market.link
    ]
  );

  return result.rows[0] || null;
}

async function upsertMarket(pool, market) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const match = await findMatchingMarket(client, market);
    const existingRow = match.row;

    if (existingRow) {
      const existingEndReference = existingRow.end_time || existingRow.start_time;
      if (marketHasEnded(existingEndReference)) {
        await client.query("COMMIT");
        return {
          action: "skipped_past_event",
          matchedOn: match.matchedOn,
          market: existingRow
        };
      }

      if (marketsEqual(existingRow, market)) {
        await client.query("COMMIT");
        return {
          action: "unchanged",
          matchedOn: match.matchedOn,
          market: existingRow
        };
      }

      const updatedMarket = await updateMarketByRowRef(client, existingRow.row_ref, market);
      if (!updatedMarket) {
        throw withStatusError("Matched market row no longer exists", 409);
      }

      await client.query("COMMIT");
      return {
        action: "updated",
        matchedOn: match.matchedOn,
        market: updatedMarket
      };
    }

    if (marketHasEnded(market.endTime || market.startTime)) {
      await client.query("COMMIT");
      return {
        action: "skipped_past_event",
        matchedOn: "none",
        market: buildMarketRowFromRequest(market)
      };
    }

    const insertedMarket = await insertMarket(client, market);
    await client.query("COMMIT");
    return {
      action: "created",
      matchedOn: "new_row",
      market: insertedMarket
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Failed to rollback market transaction", {
        message: rollbackError.message
      });
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  upsertMarket
};
