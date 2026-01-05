// This runs in the Figma sandbox - no DOM access
figma.showUI(__html__, { width: 500, height: 720 });

// Handle messages from the UI
figma.ui.onmessage = async (msg: { type: string; [key: string]: any }) => {
  console.log('[Plugin] Received message:', msg.type);

  if (msg.type === 'get-selection') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'selection-result', error: 'Please select a frame first' });
      return;
    }

    const node = selection[0];
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      figma.ui.postMessage({ type: 'selection-result', error: 'Please select a frame, component, or instance' });
      return;
    }

    figma.ui.postMessage({ 
      type: 'selection-result', 
      name: node.name,
      width: node.width,
      height: node.height,
      id: node.id
    });
  }

  if (msg.type === 'export-frame') {
    const selection = figma.currentPage.selection[0];
    
    if (!selection || !('exportAsync' in selection)) {
      figma.ui.postMessage({ type: 'export-result', error: 'Cannot export this selection' });
      return;
    }

    try {
      figma.ui.postMessage({ type: 'export-progress', message: 'Exporting frame...' });
      
      const bytes = await selection.exportAsync({ 
        format: 'PNG', 
        constraint: { type: 'SCALE', value: 2 }
      });

      // Convert Uint8Array to base64
      const base64 = figma.base64Encode(bytes);
      
      figma.ui.postMessage({ 
        type: 'export-result', 
        data: base64,
        width: selection.width,
        height: selection.height,
        name: selection.name
      });
    } catch (error) {
      figma.ui.postMessage({ 
        type: 'export-result', 
        error: error instanceof Error ? error.message : 'Export failed' 
      });
    }
  }

  if (msg.type === 'notify') {
    figma.notify(msg.message, { timeout: msg.timeout || 2000 });
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Listen for selection changes
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 1) {
    const node = selection[0];
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      figma.ui.postMessage({ 
        type: 'selection-changed', 
        name: node.name,
        width: node.width,
        height: node.height,
        id: node.id
      });
    }
  }
});
