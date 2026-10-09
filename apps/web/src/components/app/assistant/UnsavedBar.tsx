/** Floating dark bar while the Assistant page has unsaved edits (clears the 244px sidebar). */
export function UnsavedBar({
  busy,
  onDiscard,
  onSave,
}: {
  busy: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="pointer-events-none fixed right-0 bottom-[24px] left-0 z-[80] flex justify-center px-[16px] lg:left-[244px]">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="animate-mx-toast text-glass-text pointer-events-auto flex items-center gap-[14px] rounded-16 bg-[rgba(12,18,32,0.94)] py-[10px] pr-[10px] pl-[18px] shadow-[0_24px_48px_-16px_rgba(12,18,32,0.55)] backdrop-blur-[12px]"
      >
        <span className="flex items-center gap-[8px] text-[14px] whitespace-nowrap">
          <span aria-hidden="true" className="bg-amber-bright size-[7px] rounded-full" />
          Unsaved changes
        </span>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="text-glass-text h-[36px] cursor-pointer rounded-10 border border-[rgba(255,255,255,0.18)] bg-transparent px-[14px] text-[13.5px] font-medium hover:bg-[rgba(255,255,255,0.08)] disabled:cursor-default disabled:opacity-70"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          aria-busy={busy || undefined}
          className="bg-teal-bright text-ink h-[36px] cursor-pointer rounded-10 border-0 px-[14px] text-[13.5px] font-semibold whitespace-nowrap hover:bg-[#8ff0e8] disabled:cursor-default disabled:opacity-70"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
