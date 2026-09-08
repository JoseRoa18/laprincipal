import { PRESETS, presetRange, type DateRange } from "../domain/date-range";
import { DateRangeFilter } from "./date-range-filter";

/** Server wrapper: computes the preset dates for today and renders the client filter. */
export function PeriodFilter({ range, today }: { range: DateRange; today: string }) {
  const presets = PRESETS.map((key) => ({ key, ...presetRange(key, today) }));
  return <DateRangeFilter presets={presets} active={range.preset} from={range.from} to={range.to} />;
}
