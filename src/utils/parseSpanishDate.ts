const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

export function parseSpanishDate(dateStr: string): Date {
  const match = dateStr.match(/(\d+) de (\w+) de (\d+)/);
  if (match) {
    const day = parseInt(match[1]);
    const month = MONTHS[match[2].toLowerCase()];
    const year = parseInt(match[3]);
    return new Date(year, month, day);
  }
  return new Date(0);
}
