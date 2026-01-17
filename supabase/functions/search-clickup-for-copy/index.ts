import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Patterns to find SL/PT in text content
const SUBJECT_LINE_PATTERNS = [
  /subject\s*line[:\s]+["']?(.+?)["']?(?:\n|$)/i,
  /\bsl[:\s]+["']?(.+?)["']?(?:\n|$)/i,
  /email\s*subject[:\s]+["']?(.+?)["']?(?:\n|$)/i,
];

const PREVIEW_TEXT_PATTERNS = [
  /preview\s*text[:\s]+["']?(.+?)["']?(?:\n|$)/i,
  /pre-?text[:\s]+["']?(.+?)["']?(?:\n|$)/i,
  /pre-?header[:\s]+["']?(.+?)["']?(?:\n|$)/i,
  /\bpt[:\s]+["']?(.+?)["']?(?:\n|$)/i,
];

// Custom field names that might contain SL/PT
const SL_FIELD_NAMES = ['subject line', 'subject', 'sl', 'email subject'];
const PT_FIELD_NAMES = ['preview text', 'pretext', 'pre-header', 'preheader', 'pt'];

function extractFromText(text: string): { subjectLine?: string; previewText?: string } {
  let subjectLine: string | undefined;
  let previewText: string | undefined;

  for (const pattern of SUBJECT_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      subjectLine = match[1].trim();
      break;
    }
  }

  for (const pattern of PREVIEW_TEXT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      previewText = match[1].trim();
      break;
    }
  }

  return { subjectLine, previewText };
}

function extractFromCustomFields(customFields: any[]): { subjectLine?: string; previewText?: string } {
  let subjectLine: string | undefined;
  let previewText: string | undefined;

  for (const field of customFields) {
    const fieldName = (field.name || '').toLowerCase();
    const value = field.value;
    
    if (!value || typeof value !== 'string') continue;

    if (SL_FIELD_NAMES.some(n => fieldName.includes(n))) {
      subjectLine = value.trim();
    }
    if (PT_FIELD_NAMES.some(n => fieldName.includes(n))) {
      previewText = value.trim();
    }
  }

  return { subjectLine, previewText };
}

// Extract ClickUp doc links from text
function extractDocLinks(text: string): string[] {
  // ClickUp doc URLs look like: https://app.clickup.com/{workspace_id}/v/dc/{doc_id}
  // or: https://app.clickup.com/docs/{doc_id}
  const docIdPattern = /clickup\.com\/(?:\d+\/v\/dc\/|docs\/)([a-zA-Z0-9_-]+)/g;
  const matches: string[] = [];
  let match;
  while ((match = docIdPattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// Extract file key and node ID from any Figma URL format
// Handles: /file/ and /design/ URLs, node-id with :, -, or %3A encoding
function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  // Match file key from /file/ or /design/ URLs
  const fileKeyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) return null;
  
  // Match node-id parameter (handles 489-885, 489%3A885, 489:885)
  const nodeIdMatch = url.match(/node-id=([^&\s]+)/);
  if (!nodeIdMatch) return null;
  
  // Normalize node ID: decode URL encoding, replace hyphens with colons
  let nodeId = decodeURIComponent(nodeIdMatch[1]);
  nodeId = nodeId.replace(/-/g, ':');  // 489-885 -> 489:885
  
  return {
    fileKey: fileKeyMatch[1],
    nodeId: nodeId
  };
}

// Check if two Figma URLs point to the same frame
function figmaUrlsMatch(url1: string, url2: string): boolean {
  const parsed1 = parseFigmaUrl(url1);
  const parsed2 = parseFigmaUrl(url2);
  
  if (!parsed1 || !parsed2) return false;
  
  return parsed1.fileKey === parsed2.fileKey && parsed1.nodeId === parsed2.nodeId;
}

// Find all Figma URLs in a text and check if any match the target
function textContainsFigmaUrl(text: string, targetFigmaUrl: string): boolean {
  const figmaUrlsInText = text.match(/https:\/\/[^\s"'<>]*figma\.com\/[^\s"'<>]+/g) || [];
  for (const urlInText of figmaUrlsInText) {
    if (figmaUrlsMatch(urlInText, targetFigmaUrl)) {
      return true;
    }
  }
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { figmaUrl, clickupApiKey, listId, workspaceId } = await req.json();

    if (!figmaUrl || !clickupApiKey || !listId) {
      console.log('[clickup] Missing required parameters');
      return new Response(
        JSON.stringify({ found: false, error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and log the target Figma URL for debugging
    const parsedTarget = parseFigmaUrl(figmaUrl);
    console.log(`[clickup] Searching for Figma URL in list ${listId}`);
    console.log(`[clickup] Target URL: ${figmaUrl}`);
    console.log(`[clickup] Parsed target - fileKey: ${parsedTarget?.fileKey || 'NONE'}, nodeId: ${parsedTarget?.nodeId || 'NONE'}`);

    // Get tasks from the specific list
    const tasksResponse = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false&subtasks=true`,
      {
        headers: { 'Authorization': clickupApiKey }
      }
    );

    if (!tasksResponse.ok) {
      console.error('[clickup] Task list fetch failed:', await tasksResponse.text());
      return new Response(
        JSON.stringify({ found: false, error: 'ClickUp API error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tasksData = await tasksResponse.json();
    const tasks = tasksData.tasks || [];
    console.log(`[clickup] Found ${tasks.length} tasks in list`);

    // Find task containing the Figma URL (using normalized matching)
    let matchedTask = null;
    for (const task of tasks) {
      const description = task.description || '';
      const customFields = task.custom_fields || [];
      
      // Check description using normalized Figma URL matching
      if (textContainsFigmaUrl(description, figmaUrl)) {
        console.log(`[clickup] MATCH found in description of task: ${task.name}`);
        matchedTask = task;
        break;
      }
      
      // Check custom fields using normalized matching
      for (const field of customFields) {
        if (field.value && typeof field.value === 'string' && textContainsFigmaUrl(field.value, figmaUrl)) {
          console.log(`[clickup] MATCH found in custom field "${field.name}" of task: ${task.name}`);
          matchedTask = task;
          break;
        }
      }
      if (matchedTask) break;
    }

    if (!matchedTask) {
      console.log('[clickup] No matching task found for Figma URL');
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[clickup] Found task: ${matchedTask.name} (${matchedTask.id})`);

    let subjectLine: string | undefined;
    let previewText: string | undefined;

    // Priority 1: Check custom fields
    const fromFields = extractFromCustomFields(matchedTask.custom_fields || []);
    subjectLine = fromFields.subjectLine;
    previewText = fromFields.previewText;
    console.log(`[clickup] From fields - SL: ${subjectLine ? 'found' : 'none'}, PT: ${previewText ? 'found' : 'none'}`);

    // Priority 2: Check task description
    if (!subjectLine || !previewText) {
      const fromDesc = extractFromText(matchedTask.description || '');
      subjectLine = subjectLine || fromDesc.subjectLine;
      previewText = previewText || fromDesc.previewText;
      console.log(`[clickup] From description - SL: ${subjectLine ? 'found' : 'none'}, PT: ${previewText ? 'found' : 'none'}`);
    }

    // Priority 3: Check task comments
    if (!subjectLine || !previewText) {
      try {
        const commentsRes = await fetch(
          `https://api.clickup.com/api/v2/task/${matchedTask.id}/comment`,
          { headers: { 'Authorization': clickupApiKey } }
        );
        
        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          for (const comment of (commentsData.comments || [])) {
            const fromComment = extractFromText(comment.comment_text || '');
            subjectLine = subjectLine || fromComment.subjectLine;
            previewText = previewText || fromComment.previewText;
            if (subjectLine && previewText) break;
          }
          console.log(`[clickup] From comments - SL: ${subjectLine ? 'found' : 'none'}, PT: ${previewText ? 'found' : 'none'}`);
        }
      } catch (err) {
        console.error('[clickup] Error fetching comments:', err);
      }
    }

    // Priority 4: Check linked ClickUp docs
    if ((!subjectLine || !previewText) && workspaceId) {
      const docIds = extractDocLinks(matchedTask.description || '');
      console.log(`[clickup] Found ${docIds.length} linked docs`);
      
      for (const docId of docIds) {
        try {
          // Get doc pages
          const docRes = await fetch(
            `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`,
            { headers: { 'Authorization': clickupApiKey } }
          );
          
          if (docRes.ok) {
            const docData = await docRes.json();
            const pages = docData.pages || [];
            
            for (const page of pages) {
              // Get page content (markdown)
              const pageRes = await fetch(
                `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${page.id}?content_format=markdown`,
                { headers: { 'Authorization': clickupApiKey } }
              );
              
              if (pageRes.ok) {
                const pageData = await pageRes.json();
                const content = pageData.content || '';
                const fromDoc = extractFromText(content);
                subjectLine = subjectLine || fromDoc.subjectLine;
                previewText = previewText || fromDoc.previewText;
                if (subjectLine && previewText) break;
              }
            }
          }
        } catch (err) {
          console.error('[clickup] Error fetching doc:', err);
        }
        if (subjectLine && previewText) break;
      }
    }

    console.log(`[clickup] Final result - SL: ${subjectLine ? 'found' : 'none'}, PT: ${previewText ? 'found' : 'none'}`);

    return new Response(
      JSON.stringify({
        found: true,
        taskId: matchedTask.id,
        taskUrl: matchedTask.url,
        subjectLine: subjectLine || null,
        previewText: previewText || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[clickup] Error:', error);
    return new Response(
      JSON.stringify({ found: false, error: 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
