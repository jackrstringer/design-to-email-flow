// deploy-trigger
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, AuthError } from "../_shared/auth.ts";
import { newTrace, sanitizeError } from "../_shared/log.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ctx = newTrace('get-clickup-hierarchy', req);

  try {
    // The ClickUp key is the caller's own user-level key (profiles.clickup_api_key),
    // forwarded by the authenticated frontend. requireAuth rejects anonymous calls.
    await requireAuth(req);

    const { type, clickupApiKey, workspaceId, spaceId, folderId } = await req.json();

    if (!clickupApiKey) {
      return jsonResponse(req, { error: 'API key required' }, 400);
    }

    const headers = { 'Authorization': clickupApiKey };

    // Get workspaces (teams in ClickUp API)
    if (type === 'workspaces') {
      console.log('[clickup-hierarchy] Fetching workspaces...');
      const res = await fetch('https://api.clickup.com/api/v2/team', { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Workspaces fetch failed:', errorText);
        return jsonResponse(req, { error: 'Failed to fetch workspaces', details: errorText }, res.status);
      }

      const data = await res.json();
      const workspaces = (data.teams || []).map((team: any) => ({
        id: team.id,
        name: team.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${workspaces.length} workspaces`);
      return jsonResponse(req, { workspaces });
    }

    // Get spaces in a workspace
    if (type === 'spaces') {
      if (!workspaceId) {
        return jsonResponse(req, { error: 'workspaceId required' }, 400);
      }

      console.log(`[clickup-hierarchy] Fetching spaces for workspace ${workspaceId}...`);
      const res = await fetch(`https://api.clickup.com/api/v2/team/${workspaceId}/space`, { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Spaces fetch failed:', errorText);
        return jsonResponse(req, { error: 'Failed to fetch spaces' }, res.status);
      }

      const data = await res.json();
      const spaces = (data.spaces || []).map((space: any) => ({
        id: space.id,
        name: space.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${spaces.length} spaces`);
      return jsonResponse(req, { spaces });
    }

    // Get folders in a space
    if (type === 'folders') {
      if (!spaceId) {
        return jsonResponse(req, { error: 'spaceId required' }, 400);
      }

      console.log(`[clickup-hierarchy] Fetching folders for space ${spaceId}...`);
      const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Folders fetch failed:', errorText);
        return jsonResponse(req, { error: 'Failed to fetch folders' }, res.status);
      }

      const data = await res.json();
      const folders = (data.folders || []).map((folder: any) => ({
        id: folder.id,
        name: folder.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${folders.length} folders`);
      return jsonResponse(req, { folders });
    }

    // Get lists in a folder or folderless lists in a space
    if (type === 'lists') {
      let lists: any[] = [];

      // If folderId provided, get lists from that folder
      if (folderId) {
        console.log(`[clickup-hierarchy] Fetching lists for folder ${folderId}...`);
        const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, { headers });
        
        if (res.ok) {
          const data = await res.json();
          lists = (data.lists || []).map((list: any) => ({
            id: list.id,
            name: list.name,
          }));
        }
      }
      
      // Also get folderless lists from space if spaceId provided
      if (spaceId) {
        console.log(`[clickup-hierarchy] Fetching folderless lists for space ${spaceId}...`);
        const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, { headers });
        
        if (res.ok) {
          const data = await res.json();
          const folderlessLists = (data.lists || []).map((list: any) => ({
            id: list.id,
            name: list.name,
            folderless: true,
          }));
          lists = [...lists, ...folderlessLists];
        }
      }
      
      console.log(`[clickup-hierarchy] Found ${lists.length} lists`);
      return jsonResponse(req, { lists });
    }

    return jsonResponse(req, { error: 'Invalid type. Use: workspaces, spaces, folders, or lists' }, 400);

  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    return jsonResponse(req, { error: sanitizeError(ctx, error) }, 500);
  }
});
