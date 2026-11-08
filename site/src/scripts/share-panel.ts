// Share panel in the browser (decision 0027). Opens from any button with
// data-share-url. Everything happens on the device: the links are plain
// addresses, Copy link uses the clipboard, and the Instagram picture is drawn
// here and handed to the device's share sheet or downloaded. Nothing is sent
// to us, and nothing is stored.
//
// The share button carries what the panel and the picture need:
//   data-share-url    our listing page, or the organization's page for a flexible card
//   data-share-title  the listing's title; data-share-lang its language
//   data-share-when   date and time as the card shows them, or "Flexible"
//   data-share-place  the card's place line; data-share-host "Hosted by …"
import { shareLinks, type ShareTarget } from "../lib/share.ts";
import { drawCardPicture } from "./share-picture.ts";

const dialog = document.getElementById("share-panel") as HTMLDialogElement | null;

if (dialog && typeof dialog.showModal === "function") {
  const words = JSON.parse(dialog.dataset.words ?? "{}") as Record<string, string>;
  const what = dialog.querySelector<HTMLElement>("[data-share-what]")!;
  const status = dialog.querySelector<HTMLElement>("[data-share-status]")!;
  const links = [...dialog.querySelectorAll<HTMLAnchorElement>("[data-share-target]")];
  let opener: HTMLElement | null = null;
  let current: DOMStringMap = {};

  const say = (text: string) => {
    status.textContent = text;
  };

  function open(button: HTMLElement): void {
    opener = button;
    current = { ...button.dataset };
    const url = new URL(current.shareUrl ?? "", location.href).href;
    const message = (words.message ?? "{title}, {when}")
      .replace("{title}", current.shareTitle ?? "")
      .replace("{when}", current.shareWhen ?? "");
    const hrefs = shareLinks({ url, message, subject: words.subject ?? "" });
    for (const link of links) link.href = hrefs[link.dataset.shareTarget as ShareTarget];
    what.textContent = current.shareTitle ?? "";
    what.lang = current.shareLang ?? "";
    current.shareUrl = url;
    say("");
    dialog!.showModal();
    links[0]?.focus();
  }

  for (const button of document.querySelectorAll<HTMLElement>("[data-share-url]")) {
    button.addEventListener("click", () => open(button));
  }
  dialog.querySelector("[data-share-close]")?.addEventListener("click", () => dialog.close());
  // A click on the dimmed area outside the panel closes it too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  // Escape (the browser's own "cancel") and every other close put focus back.
  dialog.addEventListener("close", () => opener?.focus());

  dialog.querySelector("[data-share-copy]")?.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      // Some browsers never answer; after 2 seconds, say it did not work.
      await Promise.race([
        navigator.clipboard.writeText(current.shareUrl ?? ""),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
      say(words.copied ?? "");
    } catch {
      say(words.copyFailed ?? "");
    }
  });

  dialog.querySelector("[data-share-picture]")?.addEventListener("click", async () => {
    say(words.making ?? "");
    try {
      const blob = await drawCardPicture({
        title: current.shareTitle ?? "",
        when: current.shareWhen ?? "",
        place: current.sharePlace ?? "",
        host: current.shareHost ?? "",
        siteName: words.siteName ?? "",
        siteAddress: words.siteAddress || location.host,
      });
      // A neutral name, never the listing's title (owner, Q75): "volunteer-opportunity.png".
      const name = words.fileName || "volunteer-opportunity.png";
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          say(words.shared ?? "");
          return;
        } catch (error) {
          // The person closed the share sheet: no message needed.
          if ((error as DOMException)?.name === "AbortError") {
            say("");
            return;
          }
          // The browser refused the share sheet: save the picture instead.
        }
      }
      // No share sheet with files here: save the picture instead.
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      say(words.saved ?? "");
    } catch {
      say(words.pictureFailed ?? "");
    }
  });
}
