/**
 * Venezuela's estados → municipios → parroquias, as stored in
 * venezuela-geo.json: [{ s: estado, m: [{ n: municipio, p: [parroquias] }] }].
 * The list is about 40 KB, so screens load it only when the address is opened.
 */
export interface GeoMunicipality {
  n: string;
  p: string[];
}

export interface GeoState {
  s: string;
  m: GeoMunicipality[];
}

export type Geo = GeoState[];

export function statesOf(geo: Geo): string[] {
  return geo.map((g) => g.s);
}

export function municipalitiesOf(geo: Geo, state: string | null | undefined): string[] {
  return geo.find((g) => g.s === state)?.m.map((m) => m.n) ?? [];
}

export function parishesOf(geo: Geo, state: string | null | undefined, municipality: string | null | undefined): string[] {
  return geo.find((g) => g.s === state)?.m.find((m) => m.n === municipality)?.p ?? [];
}

/** The first address level that is not in the list under the one above it, or null when all fit. */
export function placeError(
  geo: Geo,
  place: { state: string | null; municipality: string | null; parish: string | null },
): { field: "state" | "municipality" | "parish"; message: string } | null {
  if (!place.state) return null;
  const state = geo.find((g) => g.s === place.state);
  if (!state) return { field: "state", message: "Ese estado no está en la lista" };
  if (!place.municipality) return null;
  const municipality = state.m.find((m) => m.n === place.municipality);
  if (!municipality) return { field: "municipality", message: `Ese municipio no pertenece a ${state.s}` };
  if (place.parish && !municipality.p.includes(place.parish)) return { field: "parish", message: `Esa parroquia no pertenece a ${municipality.n}` };
  return null;
}
