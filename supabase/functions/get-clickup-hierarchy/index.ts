// deploy-trigger
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, clickupApiKey, workspaceId, spaceId, folderId } = await req.json();

    if (!clickupApiKey) {
      return new Response(
        JSON.stringify({ error: 'API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = { 'Authorization': clickupApiKey };

    // Get workspaces (teams in ClickUp API)
    if (type === 'workspaces') {
      console.log('[clickup-hierarchy] Fetching workspaces...');
      const res = await fetch('https://api.clickup.com/api/v2/team', { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Workspaces fetch failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch workspaces', details: errorText }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await res.json();
      const workspaces = (data.teams || []).map((team: any) => ({
        id: team.id,
        name: team.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${workspaces.length} workspaces`);
      return new Response(
        JSON.stringify({ workspaces }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get spaces in a workspace
    if (type === 'spaces') {
      if (!workspaceId) {
        return new Response(
          JSON.stringify({ error: 'workspaceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[clickup-hierarchy] Fetching spaces for workspace ${workspaceId}...`);
      const res = await fetch(`https://api.clickup.com/api/v2/team/${workspaceId}/space`, { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Spaces fetch failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch spaces' }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await res.json();
      const spaces = (data.spaces || []).map((space: any) => ({
        id: space.id,
        name: space.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${spaces.length} spaces`);
      return new Response(
        JSON.stringify({ spaces }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get folders in a space
    if (type === 'folders') {
      if (!spaceId) {
        return new Response(
          JSON.stringify({ error: 'spaceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[clickup-hierarchy] Fetching folders for space ${spaceId}...`);
      const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, { headers });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[clickup-hierarchy] Folders fetch failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch folders' }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await res.json();
      const folders = (data.folders || []).map((folder: any) => ({
        id: folder.id,
        name: folder.name,
      }));
      
      console.log(`[clickup-hierarchy] Found ${folders.length} folders`);
      return new Response(
        JSON.stringify({ folders }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ lists }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid type. Use: workspaces, spaces, folders, or lists' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[clickup-hierarchy] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
