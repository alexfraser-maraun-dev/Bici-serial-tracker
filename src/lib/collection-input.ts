const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CollectionInputError extends Error {}

/** Accepts YYYY-MM-DD or an empty value (which clears the date). */
export function parseDateInput(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new CollectionInputError(`${label} must be a date (YYYY-MM-DD).`);
  }
  return value;
}

/** Accepts a comma-separated list of Lightspeed shop IDs. */
export function parseShopIdsInput(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const ids =
    typeof value === 'string'
      ? value.split(',').map((id) => id.trim()).filter(Boolean)
      : null;
  if (!ids || ids.some((id) => !/^\d+$/.test(id))) {
    throw new CollectionInputError('Shops must be a list of shop IDs.');
  }
  return ids.length > 0 ? [...new Set(ids)].join(',') : null;
}

export function validateWindow(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
) {
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new CollectionInputError(
      'The promo end date must be on or after the start date.',
    );
  }
}
