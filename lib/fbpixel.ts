export const fbEvent = (
  name: string,
  params: Record<string, unknown> = {},
  custom = false
) => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("capote_consent") !== "granted") return;
  const fbq = (window as any).fbq;
  if (!fbq) return;
  fbq(custom ? "trackCustom" : "track", name, params);
};
