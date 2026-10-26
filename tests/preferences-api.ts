// Compile against built public declarations, including both entry points.
import type {
  ScannerOptions,
  ScannerPreferenceChange,
  CaptureMode,
  ImageMime,
} from '../packages/scanner/dist/index.js';
import type {
  ScannerPreferenceChange as ReactPreferenceChange,
  ScannerProps,
} from '../packages/scanner/dist/react/index.js';

const change: ScannerPreferenceChange = { preference: 'initialMode', value: 'manual' };
const reactChange: ReactPreferenceChange = change;
const callback: NonNullable<ScannerOptions['onPreferenceChange']> = (event) => {
  if (event.preference === 'initialMode') {
    const mode: CaptureMode = event.value;
    void mode;
  } else {
    const mime: ImageMime = event.value;
    void mime;
  }
};
const options: ScannerProps['options'] = {
  assetBaseUrl: '/scanner-assets/',
  initialMode: 'manual',
  imageType: 'image/png',
  onPreferenceChange: callback,
};
// @ts-expect-error Export formats cannot be used as capture modes.
const wrongMode: ScannerPreferenceChange = { preference: 'initialMode', value: 'image/png' };
// @ts-expect-error WebP is an import type, not an export preference.
const wrongImage: ScannerPreferenceChange = { preference: 'imageType', value: 'image/webp' };
// @ts-expect-error Page edits are not global preferences.
const pageEdit: ScannerPreferenceChange = { preference: 'rotation', value: 90 };
void [reactChange, options, wrongMode, wrongImage, pageEdit];
