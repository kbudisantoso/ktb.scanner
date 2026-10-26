import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../errors.ts';
import { createTranslator } from '../i18n.ts';
import type { OpenOptions, ScannerOptions, ScannerController, ScanResult } from '../types.ts';
import { createScanner } from './controller.tsx';

export interface ScannerProps {
  open: boolean;
  options: Omit<ScannerOptions, 'mount'>;
  openOptions?: OpenOptions;
  onResult: (result: ScanResult) => void;
  onError?: (error: unknown) => void;
  className?: string;
}

/** Options are captured on opening; callback updates do not restart a session. */
export function Scanner(props: ScannerProps) {
  const mount = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  useEffect(() => {
    if (!props.open) return;
    let disposed = false,
      controller: ScannerController | undefined;
    const captured = latest.current;
    const fail = (reason: unknown) => {
      if (disposed) return;
      setError(errorMessage(reason));
      latest.current.onError?.(reason);
    };
    // A StrictMode setup/cleanup probe must not start a second scanner session.
    queueMicrotask(() => {
      if (disposed || !mount.current) return;
      setError('');
      try {
        controller = createScanner({
          ...captured.options,
          mount: mount.current,
          onPreferenceChange: (change) => {
            if (!disposed) return latest.current.options.onPreferenceChange?.(change);
          },
        });
        void controller
          .open(captured.openOptions)
          .then((result) => {
            if (!disposed) latest.current.onResult(result);
          })
          .catch(fail);
      } catch (error) {
        fail(error);
      }
    });
    return () => {
      disposed = true;
      void controller?.destroy();
    };
  }, [props.open]);
  return (
    <div className={props.className}>
      <div ref={mount} />
      {props.open && error && (
        <p role="alert">
          {createTranslator(
            props.options.locale === 'de' ? 'de' : 'en',
            props.options.texts,
          )(error)}
        </p>
      )}
    </div>
  );
}
