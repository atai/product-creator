import { useEffect, useId, useRef, useState } from 'react';
import { getHelpHint, HelpHintKey, HelpHint } from '@/lib/helpTexts';

interface FormHelpHintProps {
  hintKey?: HelpHintKey;
  title?: string;
  description?: string;
  className?: string;
}

export default function FormHelpHint({ hintKey, title, description, className }: FormHelpHintProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const hint: HelpHint = hintKey ? getHelpHint(hintKey) : { title: title || 'Подсказка', description: description || '' };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => !prev);
  };

  return (
    <div className={`relative inline-block ${className || ''}`}>
      <button
        type="button"
        ref={buttonRef}
        onClick={toggleOpen}
        className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
      >
        ?
      </button>

      {open && (
        <div
          ref={popoverRef}
          id={dialogId}
          role="dialog"
          aria-modal="false"
          className="absolute z-20 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 text-sm font-semibold text-gray-900">{hint.title}</div>
          <p className="text-sm text-gray-600">{hint.description}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Понятно
          </button>
        </div>
      )}
    </div>
  );
}





