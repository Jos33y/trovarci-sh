// License key with a copy control. The key is selectable as plain text when the
// clipboard API is unavailable (an http origin, or a locked-down browser).
import { useRef, useState } from 'react';
import { CopyIcon, CheckIcon } from '~/components/icons';
import styles from '~/styles/modules/admin/licenses/License.module.css';

export default function CopyKey({ value }) {
  const [copied, setCopied] = useState(false);
  const keyRef = useRef(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(keyRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  return (
    <div className={styles.keyRow}>
      <code ref={keyRef} className={styles.keyText}>{value}</code>
      <button type="button" className={styles.copyButton} onClick={copy} aria-live="polite">
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        <span>{copied ? 'Copied' : 'Copy key'}</span>
      </button>
    </div>
  );
}
