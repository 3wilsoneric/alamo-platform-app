export interface MultiSeriesDataRow {
  id: string;
  period: string;
  values: Record<string, number>;
}

export function prepareMultiSeriesData(series: string[], rows: MultiSeriesDataRow[]) {
  const safeRows = rows.map((row) => ({
    ...row,
    values: Object.fromEntries(
      series.map((name) => {
        const value = row.values[name];
        return [name, Number.isFinite(value) ? value : null];
      })
    ) as Record<string, number | null>
  }));
  const populatedSeries = series.filter((name) => safeRows.some((row) => row.values[name] != null));
  const populatedRows = safeRows.filter((row) => populatedSeries.some((name) => row.values[name] != null));

  return { populatedRows, populatedSeries };
}
