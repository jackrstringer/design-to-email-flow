// Sendr — Design to Email. Plugin main thread.
// Exports selected frames as PNG and hands them to the UI, which uploads to
// the figma-ingest edge function. Settings (server URL + plugin token) are
// kept in clientStorage so they survive restarts.

figma.showUI(__html__, { width: 380, height: 560, themeColors: true });

const SETTING_KEYS = ['serverUrl', 'pluginToken'];

function selectionSummary() {
  const frames = figma.currentPage.selection.filter(
    (n) => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION'
  );
  return frames.map((f) => ({
    id: f.id,
    name: f.name,
    width: Math.round(f.width),
    height: Math.round(f.height),
  }));
}

async function sendSettings() {
  const settings = {};
  for (const key of SETTING_KEYS) {
    settings[key] = (await figma.clientStorage.getAsync(key)) || '';
  }
  figma.ui.postMessage({ type: 'settings', settings });
}

function sendSelection() {
  figma.ui.postMessage({ type: 'selection', frames: selectionSummary() });
}

figma.on('selectionchange', sendSelection);

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'init') {
    await sendSettings();
    sendSelection();
    return;
  }

  if (msg.type === 'save-settings') {
    for (const key of SETTING_KEYS) {
      if (typeof msg.settings[key] === 'string') {
        await figma.clientStorage.setAsync(key, msg.settings[key].trim());
      }
    }
    await sendSettings();
    figma.notify('Sendr settings saved');
    return;
  }

  if (msg.type === 'export-frames') {
    const selected = figma.currentPage.selection.filter(
      (n) => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION'
    );
    if (selected.length === 0) {
      figma.ui.postMessage({ type: 'export-error', error: 'Select at least one frame first.' });
      return;
    }

    // fileKey is undefined for unsaved/drafts in some contexts; optional.
    let fileKey = null;
    try { fileKey = figma.fileKey || null; } catch (_) { /* not available */ }

    const frames = [];
    for (const node of selected) {
      figma.ui.postMessage({ type: 'export-progress', message: `Exporting "${node.name}"…` });
      try {
        const bytes = await node.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 2 },
        });
        frames.push({
          name: node.name,
          width: Math.round(node.width),
          height: Math.round(node.height),
          bytes,
          figmaUrl: fileKey
            ? `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(node.id)}`
            : null,
        });
      } catch (err) {
        figma.ui.postMessage({
          type: 'export-error',
          error: `Failed to export "${node.name}": ${err && err.message ? err.message : err}`,
        });
        return;
      }
    }
    figma.ui.postMessage({ type: 'frames-exported', frames });
    return;
  }

  if (msg.type === 'notify') {
    figma.notify(msg.message);
    return;
  }

  if (msg.type === 'open-url') {
    figma.openExternal(msg.url);
    return;
  }
};
