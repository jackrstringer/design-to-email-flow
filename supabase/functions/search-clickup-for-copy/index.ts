import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert custom field value to searchable text
function getCustomFieldText(field: any): string {
  if (!field.value) return '';
  if (typeof field.value === 'string') return field.value;
  if (Array.isArray(field.value)) {
    return field.value.map((v: any) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ');
  }
  if (typeof field.value === 'object') return JSON.stringify(field.value);
  return String(field.value);
}

// Extract ClickUp doc links from text
function extractDocLinks(text: string): string[] {
  const docIdPattern = /clickup\.com\/(?:\d+\/v\/dc\/|docs\/)([a-zA-Z0-9_-]+)/g;
  const matches: string[] = [];
  let match;
  while ((match = docIdPattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// Extract file key and node ID from any Figma URL format
function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  const fileKeyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) return null;
  
  const nodeIdMatch = url.match(/node-id=([^&\s"'<>\)\]]+)/);
  if (!nodeIdMatch) return null;
  
  let nodeId = decodeURIComponent(nodeIdMatch[1]);
  nodeId = nodeId.replace(/-/g, ':');
  
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
  const figmaUrlsInText = text.match(/https?:\/\/(?:www\.)?figma\.com\/[^\s"'<>\)\]]+/g) || [];
  for (const urlInText of figmaUrlsInText) {
    const cleanUrl = urlInText.replace(/[.,;:!?\)]+$/, '');
    if (figmaUrlsMatch(cleanUrl, targetFigmaUrl)) {
      return true;
    }
  }
  return false;
}

// Fetch individual task details with full description
async function fetchTaskDetail(taskId: string, clickupApiKey: string): Promise<any | null> {
  try {
    // Note: Don't pass custom_fields=true in query - Get Task endpoint returns custom_fields by default
    // and some ClickUp workspaces reject the parameter with ITEM_156 error
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}?include_markdown_description=true`,
      { headers: { 'Authorization': clickupApiKey } }
    );
    if (response.ok) {
      return await response.json();
    } else {
      const errorText = await response.text();
      console.error(`[clickup] Get task ${taskId} failed (${response.status}):`, errorText);
    }
  } catch (err) {
    console.error(`[clickup] Error fetching task ${taskId}:`, err);
  }
  return null;
}

// Use AI to extract SL/PT from all task text content
async function extractWithAI(allTextContent: string): Promise<{ subjectLine?: string; previewText?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('[clickup] No LOVABLE_API_KEY, skipping AI extraction');
    return {};
  }

  // Smart truncation: keep first 4000 + last 4000 chars to preserve SL/PT that might be at the end
  let truncatedContent = allTextContent;
  if (allTextContent.length > 8000) {
    const first = allTextContent.substring(0, 4000);
    const last = allTextContent.substring(allTextContent.length - 4000);
    truncatedContent = first + '\n\n...[middle content truncated]...\n\n' + last;
    console.log(`[clickup] Content truncated: ${allTextContent.length} -> ${truncatedContent.length} chars (first 4000 + last 4000)`);
  }

const prompt = `You are analyzing content from an email marketing task.
Your job is to find the EMAIL SUBJECT LINE and EMAIL PREVIEW TEXT if they exist.

ONLY look for these specific labels (case-insensitive):

SUBJECT LINE labels:
- "Subject Line" / "Subject Line:" / "Subject-Line"
- "SL" / "SL:" / "SL -"
- "Email Subject" / "Email Subject:"

PREVIEW TEXT labels:
- "Preview Text" / "Preview Text:" / "Preview-Text"
- "PT" / "PT:" / "PT -"
- "Pretext" / "Pre-text" / "Pre text"
- "Preheader" / "Pre-header" / "Pre header"

DO NOT extract:
- Headlines, titles, or headers (these are different)
- Body copy or general copy
- Teasers or secondary copy
- Any other marketing copy fields

FORMATS TO RECOGNIZE:
- "Subject Line: Your text here" → extract "Your text here"
- "SL: Your text here" → extract "Your text here"
- "PT: Your text here" → extract "Your text here"
- **Subject Line:** Your text here (markdown bold label)
- Label on one line, value on next line

Extract ONLY the value, not the label itself.

TASK CONTENT:
---
${truncatedContent}
---

Respond with ONLY valid JSON (no markdown, no explanation):
{"subjectLine": "the extracted subject line or null if not found", "previewText": "the extracted preview text or null if not found"}`;

  try {
    console.log('[clickup] Calling AI for SL/PT extraction...');
    console.log('[clickup] Content length:', allTextContent.length, 'chars (truncated to:', truncatedContent.length, ')');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[clickup] AI API error:', response.status, errorText);
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[clickup] AI raw response:', content);

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    return {
      subjectLine: parsed.subjectLine === 'null' || !parsed.subjectLine ? undefined : parsed.subjectLine,
      previewText: parsed.previewText === 'null' || !parsed.previewText ? undefined : parsed.previewText,
    };
  } catch (err) {
    console.error('[clickup] AI extraction error:', err);
    return {};
  }
}

// Collect all text content from a task for AI analysis
async function collectAllTaskText(task: any, clickupApiKey: string, workspaceId?: string): Promise<string> {
  let allText = '';

  // Task name
  allText += `Task Name: ${task.name}\n\n`;

  // Description
  const description = task.markdown_description || task.description || '';
  if (description) {
    allText += `Description:\n${description}\n\n`;
  }

  // All custom fields (with names and values)
  const customFields = task.custom_fields || [];
  console.log(`[clickup] Task has ${customFields.length} custom fields:`);
  
  for (const field of customFields) {
    const value = getCustomFieldText(field);
    const valuePreview = value?.substring(0, 100) || 'empty';
    console.log(`[clickup]   - "${field.name}" (type: ${field.type}): "${valuePreview}${value?.length > 100 ? '...' : ''}"`);
    
    if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
      allText += `${field.name}: ${value}\n`;
    }
  }
  allText += '\n';

  // Comments
  try {
    const commentsRes = await fetch(
      `https://api.clickup.com/api/v2/task/${task.id}/comment`,
      { headers: { 'Authorization': clickupApiKey } }
    );
    
    if (commentsRes.ok) {
      const commentsData = await commentsRes.json();
      const comments = commentsData.comments || [];
      console.log(`[clickup] Found ${comments.length} comments`);
      
      for (const comment of comments) {
        const commentText = comment.comment_text || '';
        if (commentText) {
          allText += `Comment: ${commentText}\n`;
        }
      }
    }
  } catch (err) {
    console.error('[clickup] Error fetching comments:', err);
  }

  // Linked ClickUp docs
  if (workspaceId) {
    const docIds = extractDocLinks(description);
    console.log(`[clickup] Found ${docIds.length} linked docs`);
    
    for (const docId of docIds.slice(0, 3)) { // Limit to 3 docs
      try {
        const docRes = await fetch(
          `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`,
          { headers: { 'Authorization': clickupApiKey } }
        );
        
        if (docRes.ok) {
          const docData = await docRes.json();
          const pages = docData.pages || [];
          
          for (const page of pages.slice(0, 3)) { // Limit to 3 pages per doc
            const pageRes = await fetch(
              `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${page.id}?content_format=markdown`,
              { headers: { 'Authorization': clickupApiKey } }
            );
            
            if (pageRes.ok) {
              const pageData = await pageRes.json();
              const content = pageData.content || '';
              if (content) {
                allText += `\nDoc Page "${page.name}":\n${content}\n`;
              }
            }
          }
        }
      } catch (err) {
        console.error('[clickup] Error fetching doc:', err);
      }
    }
  }

  return allText;
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

    // Get tasks from the specific list WITH descriptions
    // Note: Do NOT pass custom_fields=true - some ClickUp workspaces reject it with ITEM_156 error
    // Custom fields are included by default in the response anyway
    const tasksResponse = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false&subtasks=true&include_markdown_description=true`,
      {
        headers: { 'Authorization': clickupApiKey }
      }
    );

    if (!tasksResponse.ok) {
      const errorBody = await tasksResponse.text();
      console.error('[clickup] Task list fetch failed:', tasksResponse.status, errorBody);
      return new Response(
        JSON.stringify({ found: false, error: 'ClickUp API error', clickupStatus: tasksResponse.status, clickupError: errorBody }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tasksData = await tasksResponse.json();
    const tasks = tasksData.tasks || [];
    console.log(`[clickup] Found ${tasks.length} tasks in list`);

    // Find task containing the Figma URL (using normalized matching)
    let matchedTask = null;
    
    // First pass: check list response data
    for (const task of tasks) {
      const description = task.markdown_description || task.description || '';
      const customFields = task.custom_fields || [];
      
      // Check description using normalized Figma URL matching
      if (description && textContainsFigmaUrl(description, figmaUrl)) {
        console.log(`[clickup] MATCH found in description of task: ${task.name}`);
        matchedTask = task;
        break;
      }
      
      // Check custom fields using normalized matching
      for (const field of customFields) {
        const fieldText = getCustomFieldText(field);
        if (fieldText && textContainsFigmaUrl(fieldText, figmaUrl)) {
          console.log(`[clickup] MATCH found in custom field "${field.name}" of task: ${task.name}`);
          matchedTask = task;
          break;
        }
      }
      if (matchedTask) break;
    }

    // Fallback: if no match found, fetch individual task details (capped at 50)
    if (!matchedTask) {
      console.log('[clickup] No match in list response, trying individual task fetch fallback...');
      const tasksToCheck = tasks.slice(0, 50);
      
      for (const task of tasksToCheck) {
        const taskDetail = await fetchTaskDetail(task.id, clickupApiKey);
        if (!taskDetail) continue;
        
        const description = taskDetail.markdown_description || taskDetail.description || '';
        const customFields = taskDetail.custom_fields || [];
        
        if (description && textContainsFigmaUrl(description, figmaUrl)) {
          console.log(`[clickup] MATCH found in fallback fetch for task: ${task.name}`);
          matchedTask = taskDetail;
          break;
        }
        
        for (const field of customFields) {
          const fieldText = getCustomFieldText(field);
          if (fieldText && textContainsFigmaUrl(fieldText, figmaUrl)) {
            console.log(`[clickup] MATCH found in custom field (fallback) "${field.name}" of task: ${task.name}`);
            matchedTask = taskDetail;
            break;
          }
        }
        if (matchedTask) break;
      }
    }

    if (!matchedTask) {
      console.log('[clickup] No matching task found for Figma URL');
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[clickup] Found task: ${matchedTask.name} (${matchedTask.id})`);

    // Collect ALL text content from the task
    const allTextContent = await collectAllTaskText(matchedTask, clickupApiKey, workspaceId);
    console.log(`[clickup] Total collected text: ${allTextContent.length} chars`);
    console.log(`[clickup] Text preview:\n${allTextContent.substring(0, 500)}...`);

    // Use AI to extract SL/PT from all collected text
    const aiResult = await extractWithAI(allTextContent);
    const subjectLine = aiResult.subjectLine || null;
    const previewText = aiResult.previewText || null;

    console.log(`[clickup] Final result - SL: ${subjectLine ? `"${subjectLine}"` : 'none'}, PT: ${previewText ? `"${previewText}"` : 'none'}`);

    return new Response(
      JSON.stringify({
        found: true,
        taskId: matchedTask.id,
        taskUrl: matchedTask.url,
        subjectLine,
        previewText,
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
