// Shows the Contact form's error message (decision 0046). The private Worker
// sends people back to /<lang>/contact/?error=<code> when something is wrong.
// This reads that one code, shows its message from the page (translation
// files) at the top, focuses it, and ties it to the field it is about. It
// only reads the address; it never changes it, stores nothing and sends nothing.
const box = document.getElementById("contact-error");
const code = new URLSearchParams(location.search).get("error") ?? "";
/** Codes about one field: that field is marked invalid and described by the message. */
const FIELDS: Record<string, string> = {
  kind: "contact-kind",
  name: "contact-name",
  email: "contact-email",
  message: "contact-message",
};
if (box && /^[a-z-]{1,20}$/.test(code)) {
  const text = box.getAttribute(`data-error-${code}`);
  if (text) {
    box.textContent = text;
    box.hidden = false;
    const field = FIELDS[code] ? document.getElementById(FIELDS[code]) : null;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "contact-error");
    }
    box.focus();
  }
}
