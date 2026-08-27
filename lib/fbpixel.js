export const fbEvent = (
  name,
  params = {},
  custom = false
) => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("capote_consent") !== "granted") return;
  const fbq = window.fbq;
  if (!fbq) return;
  fbq(custom ? "trackCustom" : "track", name, params);
};
