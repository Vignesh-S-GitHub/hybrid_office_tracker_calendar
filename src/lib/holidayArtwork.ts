const holidayNames: ReadonlyArray<[string, string]> = [
  ["republic day", "republic-day"],
  ["id-ul-fitr", "id-ul-fitr"],
  ["mahavir", "mahavir-jayanti"],
  ["good friday", "good-friday"],
  ["buddha purnima", "buddha-purnima"],
  ["id-ul-zuha", "id-ul-zuha"],
  ["muharram", "muharram"],
  ["independence day", "independence-day"],
  ["prophet mohammad", "milad-un-nabi"],
  ["mahatma gandhi", "gandhi-jayanti"],
  ["dussehra", "dussehra"],
  ["diwali", "diwali"],
  ["guru nanak", "guru-nanak-jayanti"],
  ["christmas", "christmas-day"],
];

/** Decorative artwork only. Dates and labels remain sourced from holiday JSON. */
export function holidayArtwork(name: string, variant: "banner" | "illustration"): string {
  const slug = holidayNames.find(([label]) =>
    name.toLocaleLowerCase("en").includes(label),
  )?.[1];
  return slug
    ? `${import.meta.env.BASE_URL}ui-kit/holidays/${variant}/${slug}.svg`
    : `${import.meta.env.BASE_URL}ui-kit/illustrations/empty-calendar.svg`;
}
