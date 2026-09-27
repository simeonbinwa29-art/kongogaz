/** Les 24 communes officielles de Kinshasa, réparties par district (tri alphabétique). */
export const KINSHASA_DISTRICTS: { district: string; communes: string[] }[] = [
  {
    district: "Lukunga",
    communes: ["Barumbu", "Gombe", "Kinshasa", "Kintambo", "Lingwala", "Ngaliema"],
  },
  {
    district: "Funa",
    communes: ["Bandalungwa", "Bumbu", "Kalamu", "Kasa-Vubu", "Makala", "Ngiri-Ngiri", "Selembao"],
  },
  {
    district: "Mont-Amba",
    communes: ["Kisenso", "Lemba", "Limete", "Matete", "Mont-Ngafula", "Ngaba"],
  },
  {
    district: "Tshangu",
    communes: ["Kimbanseke", "Maluku", "Masina", "N'djili", "N'sele"],
  },
];

export const KINSHASA_COMMUNES: string[] = KINSHASA_DISTRICTS.flatMap((d) => d.communes)
  .slice()
  .sort((a, b) => a.localeCompare(b, "fr"));

export function districtOf(commune: string): string | undefined {
  return KINSHASA_DISTRICTS.find((d) => d.communes.includes(commune))?.district;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function searchCommunes(query: string) {
  const q = norm(query.trim());
  if (!q) return KINSHASA_DISTRICTS;
  return KINSHASA_DISTRICTS.map((d) => ({
    district: d.district,
    communes: d.communes.filter((c) => norm(c).includes(q) || norm(d.district).includes(q)),
  })).filter((d) => d.communes.length > 0);
}
