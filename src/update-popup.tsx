/**
 * Oct 14 client: phone app "New version available" pop-up (shown on app start and
 * when the app comes back to the front). The rules live in app-version-check.ts
 * (decideUpdatePopup). 'ask' has Update now + Later (Later = hide for 24 hours);
 * 'force' blocks the app until the driver updates.
 */
import { openStoreListing, IOS_APP_STORE_URL, type UpdatePopupState } from './app-version-check';

export function UpdatePopup({ state, isIOS, iosStoreUrl, onLater, onClose }: {
  state: Exclude<UpdatePopupState, 'none'>;
  isIOS: boolean;
  iosStoreUrl: string | null;
  onLater: () => void;
  onClose: () => void;
}) {
  const force = state === 'force';
  // Oct 14 client: iPhone always has the App Store link now (built-in default), so Update now opens it.
  const iosUrl = iosStoreUrl || IOS_APP_STORE_URL;
  const noLink = isIOS && !iosUrl;
  const title = force ? 'This version is too old — please update' : 'New version available';
  const text = noLink
    ? 'Open the App Store and update Zeh L\'Zeh.'
    : force
      ? 'This version of the Zeh L\'Zeh app is too old to keep using. Please update it to continue.'
      : 'Please update the Zeh L\'Zeh app to get the latest fixes.';
  return (
    <div data-update-popup={state} role="dialog" aria-modal="true" aria-labelledby="zlz-update-title"
         className="fixed inset-0 z-[9000] bg-black/50 grid place-items-center px-6">
      <div className="max-w-[380px] w-full bg-paper border border-line rounded-[18px] shadow-lift p-6 text-center">
        <div className="text-[34px] leading-none" aria-hidden="true">🔄</div>
        <div id="zlz-update-title" className="mt-2 text-[21px] font-extrabold text-ink font-display leading-tight">{title}</div>
        <p className="text-[15px] text-muted mt-3 leading-snug">{text}</p>
        {!(noLink && force) && (
          <button type="button"
                  onClick={() => { if (!noLink) openStoreListing(isIOS, iosUrl); if (!force) onClose(); }}
                  className="mt-5 w-full bg-forest text-paper font-extrabold text-[16px] py-3 rounded-full active:scale-95">
            {noLink ? 'OK' : 'Update now'}
          </button>
        )}
        {!force && (
          <button type="button" onClick={onLater}
                  className="mt-2 w-full text-forest font-bold text-[15px] py-2.5 rounded-full active:scale-95">
            Later
          </button>
        )}
      </div>
    </div>
  );
}
