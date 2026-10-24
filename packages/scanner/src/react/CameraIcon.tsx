export function CameraIcon({ name }: { name: 'close' | 'more' | 'gallery' | 'back' | 'light' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
      {name === 'more' && (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      )}
      {name === 'gallery' && (
        <>
          <rect x="4" y="6" width="17" height="15" rx="3" />
          <path d="M1 16V5a3 3 0 0 1 3-3h12M4 17l5-5 4 4 3-3 5 5" />
          <circle cx="16" cy="10" r="1" />
        </>
      )}
      {name === 'back' && <path d="m14 5-7 7 7 7" />}
      {name === 'light' && <path d="m14 2-9 12h6l-1 8 9-12h-6z" />}
    </svg>
  );
}
