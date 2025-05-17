// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "ScriptBob",               // Panel title
  "icons/icon16.png",         // Panel icon
  "panel.html",               // Panel HTML page
  function(panel) {
    // Panel created
    console.log("ScriptBob panel created");
  }
);