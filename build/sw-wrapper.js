// The service worker should not attempt to run the legacy DOM bundle.
// The offscreen page (pages/offscreen.html) will load `sw-legacy-shim.js`
// and then `build/all.js` inside a DOM-capable context. The service worker
// only ensures the offscreen page exists (or opens it as a tab) and logs
// diagnostic information.

// Import the main bundle. This will run the extension code inside the SW
// context (the bundle was originally intended for background pages). Using
// importScripts keeps the same global scope but ensures analytics exists.
try {
  // If MV3 offscreen is available, create an offscreen document which can
  // load the full UI/bundle (provides DOM and AudioContext). Otherwise fall
  // back to importScripts to run the bundle inside the worker (best-effort).
  if (chrome && chrome.offscreen && chrome.offscreen.createDocument) {
    console.log('sw-wrapper: chrome.offscreen available, attempting offscreen document');
    chrome.offscreen.hasDocument().then(function(has) {
      if (!has) {
        chrome.offscreen.createDocument({
          url: 'pages/offscreen.html',
          reasons: ['AUDIO_PLAYBACK', 'BLOBS'],
          justification: 'Provide background audio and UI for legacy bundle'
        }).then(function() {
          console.log('sw-wrapper: offscreen document created');
        }).catch(function(e) {
          console.error('sw-wrapper: offscreen.createDocument failed', e);
          // Try to open the offscreen page in a visible tab so the legacy
          // bundle runs in a DOM-capable context. This requires the 'tabs'
          // permission which is present in the manifest.
          try {
            if (chrome && chrome.tabs && chrome.tabs.create) {
              var url = 'chrome-extension://' + chrome.runtime.id + '/pages/offscreen.html';
              chrome.tabs.create({ url: url }, function(tab) {
                if (chrome.runtime.lastError) {
                  console.error('sw-wrapper: failed to open offscreen page in a tab', chrome.runtime.lastError);
                } else {
                  console.log('sw-wrapper: opened offscreen page in tab', tab && tab.id);
                }
              });
            } else {
              console.error('sw-wrapper: chrome.tabs.create is not available in this environment; open pages/offscreen.html manually');
            }
          } catch (ex) {
            console.error('sw-wrapper: error while trying to open offscreen page in tab', ex);
          }
        });
      } else {
        console.log('sw-wrapper: offscreen document already present');
      }
    }).catch(function(e) {
      console.error('sw-wrapper: chrome.offscreen.hasDocument threw', e);
      console.error('sw-wrapper: cannot create offscreen document in this environment; legacy bundle will not be loaded in the service worker. Open pages/offscreen.html manually.');
    });
  } else {
    console.error('sw-wrapper: chrome.offscreen API is not available; legacy bundle requires an offscreen document (pages/offscreen.html). The service worker will not import all.js to avoid runtime errors.');
  }
} catch (e) {
  console.error('Failed to import all.js in sw-wrapper:', e);
}
