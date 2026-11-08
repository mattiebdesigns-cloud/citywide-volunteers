// Heart (save on this device), share, and "Add to my calendar".
// Buttons are found by data attributes, so pv-design's components can carry them:
//   data-save-id="<listing id>"             heart; aria-pressed shows the state
//   (share buttons, data-share-url, open the share panel: scripts/share-panel.ts)
//   data-ics="<calendar file text>" data-ics-name="<file name>"
import { readSaved, writeSaved } from "./device.ts";

export const SAVED_CHANGED = "cvh:saved-changed";

function wireSave(): void {
  const saved = readSaved();
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-save-id]")) {
    const id = button.dataset.saveId ?? "";
    button.setAttribute("aria-pressed", String(saved.has(id)));
    button.addEventListener("click", () => {
      const now = readSaved();
      if (now.has(id)) now.delete(id);
      else now.add(id);
      writeSaved(now);
      for (const same of document.querySelectorAll<HTMLButtonElement>(`[data-save-id="${CSS.escape(id)}"]`)) {
        same.setAttribute("aria-pressed", String(now.has(id)));
      }
      document.dispatchEvent(new CustomEvent(SAVED_CHANGED));
    });
  }
}

function wireIcs(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-ics]")) {
    button.hidden = false;
    button.addEventListener("click", () => {
      // Made in the browser: no request reaches any server.
      const blob = new Blob([button.dataset.ics ?? ""], { type: "text/calendar;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = button.dataset.icsName ?? "shift.ics";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    });
  }
}

wireSave();
wireIcs();
