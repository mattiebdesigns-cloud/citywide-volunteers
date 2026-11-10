// The Dark mode switch in the footer (owner, 2026-11-10: "Light, with a switch").
// The site is light by default. The choice is kept in this browser only
// (localStorage "cvh.theme"); if storage is blocked the switch still works for
// this page. No cookie, nothing in the address, nothing sent anywhere.
// Other parts (the map) follow the "pv:themechange" event.
const KEY = "cvh.theme";
const root = document.documentElement;

export function isDark(): boolean {
  return root.dataset.theme === "dark";
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
  button.setAttribute("aria-pressed", String(isDark()));
  button.hidden = false;
  button.addEventListener("click", () => {
    const dark = !isDark();
    root.dataset.theme = dark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(dark));
    try {
      if (dark) localStorage.setItem(KEY, "dark");
      else localStorage.removeItem(KEY);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    document.dispatchEvent(new CustomEvent("pv:themechange"));
  });
}
