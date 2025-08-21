import React, { useState, useRef } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

/**
 * EmojiPickerButton
 * Props:
 *  - inputRef: React ref to a controlled <input> or <textarea>
 *  - theme: "light" | "dark"
 *  - className / style: for the trigger button
 */
export default function EmojiPickerButton({ inputRef, theme = "dark", className = "", style = {} }) {
  const [open, setOpen] = useState(false);

  function insertAtCursor(native) {
    const el = inputRef?.current;
    if (!el) return;

    // Insert into the underlying DOM input so React sees an 'input' event
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    if (el.setRangeText) {
      el.setRangeText(native, start, end, "end");
    } else {
      const val = el.value ?? "";
      el.value = val.slice(0, start) + native + val.slice(end);
      // restore caret manually if needed
      const pos = start + native.length;
      try { el.setSelectionRange(pos, pos); } catch {}
    }
    // Dispatch a native 'input' event so React-controlled value updates
    const e = new Event("input", { bubbles: true });
    el.dispatchEvent(e);
    el.focus();
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Insert emoji"
        onClick={() => setOpen(v => !v)}
        className={className}
        style={style}
      >
        <span role="img" aria-label="emoji">😊</span>
      </button>

      {open && (
        <div
          className="absolute z-50 right-0 top-10 rounded-2xl border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Picker
            data={data}
            onEmojiSelect={(emoji) => {
              insertAtCursor(emoji?.native || "");
              setOpen(false);
            }}
            theme={theme}
            previewPosition="none"
            navPosition="none"
            perLine={8}
          />
        </div>
      )}
    </div>
  );
}
