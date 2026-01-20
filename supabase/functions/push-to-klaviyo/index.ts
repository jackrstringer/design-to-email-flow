import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SliceData {
  imageUrl: string;
  altText: string;
  link?: string | null;
  type?: 'image' | 'html';
  htmlContent?: string;
  column?: number; // Which column (0-based) in a multi-column row
  totalColumns?: number; // Total columns in this row (1-4)
  rowIndex?: number; // Which row this slice belongs to
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      imageUrl, 
      templateName,
      campaignName, // Legacy field alias for templateName
      klaviyoApiKey, 
      brandId, // Legacy field - used to fetch klaviyoApiKey server-side
      footerHtml, 
      mode = 'template', 
      listId, 
      slices,
      includedSegments,
      excludedSegments,
      subjectLine,
      previewText,
      sendPreviewTo, // Email address to send preview to after campaign creation
    } = body;

    // Support both single image and slices array
    const hasSlices = Array.isArray(slices) && slices.length > 0;
    
    // Resolve templateName (support legacy campaignName field)
    const resolvedTemplateName = templateName || campaignName;
    
    // Initialize resolved values
    let resolvedKlaviyoApiKey = klaviyoApiKey;
    let resolvedFooterHtml = footerHtml;
    
    // If klaviyoApiKey not provided but brandId is, fetch from database
    if (!resolvedKlaviyoApiKey && brandId) {
      console.log(`Fetching klaviyo_api_key from brand: ${brandId}`);
      
      // Extract user ID from JWT for authorization
      const authHeader = req.headers.get('Authorization');
      let userId: string | null = null;
      
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const payloadBase64 = token.split('.')[1];
          const payload = JSON.parse(atob(payloadBase64));
          userId = payload.sub;
        } catch (e) {
          console.error('Failed to decode JWT:', e);
        }
      }
      
      // Fetch brand data using service role
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const { data: brand, error: brandError } = await supabase
        .from('brands')
        .select('klaviyo_api_key, footer_html, user_id')
        .eq('id', brandId)
        .single();
      
      if (brandError || !brand) {
        return new Response(
          JSON.stringify({ error: 'Brand not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Authorization check: ensure caller owns this brand
      if (userId && brand.user_id && brand.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for this brand' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!brand.klaviyo_api_key) {
        return new Response(
          JSON.stringify({ error: 'Brand does not have a Klaviyo API key configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      resolvedKlaviyoApiKey = brand.klaviyo_api_key;
      resolvedFooterHtml = resolvedFooterHtml || brand.footer_html;
      console.log(`Resolved klaviyo_api_key from brand, footer included: ${!!resolvedFooterHtml}`);
    }

    // Validate required fields
    const receivedKeys = Object.keys(body);
    console.log(`Received keys: ${receivedKeys.join(', ')}, hasSlices: ${hasSlices}, hasImageUrl: ${!!imageUrl}`);
    
    if ((!imageUrl && !hasSlices) || !resolvedTemplateName || !resolvedKlaviyoApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: imageUrl or slices, templateName, klaviyoApiKey',
          receivedKeys,
          hasImageUrl: !!imageUrl,
          hasSlices,
          hasTemplateName: !!resolvedTemplateName,
          hasKlaviyoApiKey: !!resolvedKlaviyoApiKey
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating Klaviyo template: ${resolvedTemplateName}`);
    console.log(`Mode: ${mode}, Footer included: ${!!resolvedFooterHtml}, Slices: ${hasSlices ? slices.length : 0}`);

    // Dark mode CSS for footer - only override text colors, NOT background colors
    // Background colors are controlled by inline styles to allow AI modifications
    const darkModeCss = resolvedFooterHtml ? `
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .darkmode-text { color: #ffffff !important; }
    }
  </style>` : '';

    // Footer section - inject directly since footerHtml contains proper <tr> elements
    const footerSection = resolvedFooterHtml ? resolvedFooterHtml : '';

    // Build image content - either single image or multiple slices (with column support)
    let imageContent: string;
    
    if (hasSlices) {
      const slicesArray = slices as SliceData[];
      
      // Assign rowIndex to slices that don't have one - each slice without rowIndex gets its own row
      slicesArray.forEach((slice, index) => {
        if (slice.rowIndex === undefined || slice.rowIndex === null) {
          slice.rowIndex = index;
        }
      });
      
      // Group slices by rowIndex for multi-column support
      const rowGroups = new Map<number, SliceData[]>();
      slicesArray.forEach((slice) => {
        const rowIdx = slice.rowIndex ?? 0;
        if (!rowGroups.has(rowIdx)) {
          rowGroups.set(rowIdx, []);
        }
        rowGroups.get(rowIdx)!.push(slice);
      });

      // Sort rows by rowIndex and generate HTML
      const sortedRows = Array.from(rowGroups.entries()).sort((a, b) => a[0] - b[0]);
      
      imageContent = sortedRows.map(([_rowIndex, rowSlices]) => {
        // Sort slices within row by column index
        rowSlices.sort((a, b) => (a.column ?? 0) - (b.column ?? 0));
        
        const totalColumns = rowSlices[0]?.totalColumns ?? 1;
        
        if (totalColumns === 1) {
          // Single column row - original behavior
          const slice = rowSlices[0];
          
          if (slice.type === 'html' && slice.htmlContent) {
            return `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-text-block">
                ${slice.htmlContent}
              </div>
            </td>
          </tr>`;
          }
          
          const imgTag = `<img src="${slice.imageUrl}" width="600" style="display: block; width: 100%; height: auto;" alt="${slice.altText || 'Email image'}" />`;
          
          if (slice.link) {
            return `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-image-block">
                <a href="${slice.link}" target="_blank" style="text-decoration: none;">
                  ${imgTag}
                </a>
              </div>
            </td>
          </tr>`;
          }
          
          return `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-image-block">
                ${imgTag}
              </div>
            </td>
          </tr>`;
        } else {
          // Multi-column row - create nested table
          const columnWidth = Math.floor(600 / totalColumns);
          const columnPercent = (100 / totalColumns).toFixed(2);
          
          const columnCells = rowSlices.map((slice) => {
            if (slice.type === 'html' && slice.htmlContent) {
              return `<td width="${columnPercent}%" valign="top" style="padding: 0;">
                <div class="klaviyo-block klaviyo-text-block">
                  ${slice.htmlContent}
                </div>
              </td>`;
            }
            
            const imgTag = `<img src="${slice.imageUrl}" width="${columnWidth}" style="display: block; width: 100%; height: auto;" alt="${slice.altText || 'Email image'}" />`;
            
            if (slice.link) {
              return `<td width="${columnPercent}%" valign="top" style="padding: 0;">
                <a href="${slice.link}" target="_blank" style="text-decoration: none;">
                  ${imgTag}
                </a>
              </td>`;
            }
            
            return `<td width="${columnPercent}%" valign="top" style="padding: 0;">
              ${imgTag}
            </td>`;
          }).join('\n              ');
          
          return `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  ${columnCells}
                </tr>
              </table>
            </td>
          </tr>`;
        }
      }).join('\n');
    } else {
      // Single image (legacy support)
      imageContent = `<tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-image-block">
                <img src="${imageUrl}" width="600" style="display: block; width: 100%; height: auto;" alt="${resolvedTemplateName}" />
              </div>
            </td>
          </tr>`;
    }

    // Build the hybrid HTML template with Klaviyo editable region
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${resolvedTemplateName}</title>${darkModeCss}
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
          ${imageContent}${footerSection}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Call Klaviyo API to create the template
    const response = await fetch('https://a.klaviyo.com/api/templates', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${resolvedKlaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2025-01-15'
      },
      body: JSON.stringify({
        data: {
          type: 'template',
          attributes: {
            name: resolvedTemplateName,
            editor_type: 'USER_DRAGGABLE',
            html: html
          }
        }
      })
    });

    const responseText = await response.text();
    console.log(`Klaviyo template response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = 'Failed to create Klaviyo template';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.errors?.[0]?.detail || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templateData = JSON.parse(responseText);
    const templateId = templateData.data?.id;
    console.log(`Template created successfully: ${templateId}`);

    // If mode is 'template', return just the template
    if (mode === 'template') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          templateId,
          message: 'Template created successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode is 'campaign' - create campaign and assign template
    if (!listId) {
      return new Response(
        JSON.stringify({ error: 'listId is required for campaign mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided segments or fall back to listId
    const included = includedSegments && includedSegments.length > 0 ? includedSegments : [listId];
    const excluded = excludedSegments || [];
    
    // Use provided subject/preview or defaults
    const emailSubject = subjectLine || 'Hi there';
    const emailPreview = previewText || '';
    
    console.log(`Creating campaign with included: ${included.join(', ')}, excluded: ${excluded.join(', ')}`);
    console.log(`Subject: "${emailSubject}", Preview: "${emailPreview}"`);

    // Create campaign with campaign-messages inline (required by Klaviyo API)
    const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${resolvedKlaviyoApiKey}`,
        'Content-Type': 'application/vnd.api+json',
        'accept': 'application/vnd.api+json',
        'revision': '2025-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'campaign',
          attributes: {
            name: resolvedTemplateName,
            audiences: {
              included: included,
              excluded: excluded
            },
            send_strategy: {
              method: 'immediate'
            },
            send_options: {
              use_smart_sending: true
            },
            'campaign-messages': {
              data: [
                {
                  type: 'campaign-message',
                  attributes: {
                    definition: {
                      channel: 'email',
                      label: resolvedTemplateName,
                      content: {
                        subject: emailSubject,
                        preview_text: emailPreview
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      })
    });

    const campaignResponseText = await campaignResponse.text();
    console.log(`Klaviyo campaign response status: ${campaignResponse.status}`);

    if (!campaignResponse.ok) {
      let errorMessage = 'Failed to create Klaviyo campaign';
      try {
        const errorData = JSON.parse(campaignResponseText);
        errorMessage = errorData.errors?.[0]?.detail || errorMessage;
      } catch {
        errorMessage = campaignResponseText || errorMessage;
      }
      
      // Log detailed error for debugging
      console.error(`Campaign creation FAILED for template ${templateId}:`);
      console.error(`  Included segments: ${JSON.stringify(included)}`);
      console.error(`  Excluded segments: ${JSON.stringify(excluded)}`);
      console.error(`  Error: ${errorMessage}`);
      console.error(`  Full response: ${campaignResponseText}`);

      // Still return template ID so user can use it
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          error: `Template created but campaign failed: ${errorMessage}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignData = JSON.parse(campaignResponseText);
    const campaignId = campaignData.data?.id;
    console.log(`Campaign created: ${campaignId}`);

    // Get the campaign message ID from relationships
    const campaignMessageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id;
    console.log(`Campaign message ID: ${campaignMessageId}`);

    if (!campaignMessageId) {
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          campaignId,
          error: 'Campaign created but could not get message ID to assign template',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assign template to campaign message using the correct endpoint
    const assignResponse = await fetch('https://a.klaviyo.com/api/campaign-message-assign-template', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${resolvedKlaviyoApiKey}`,
        'Content-Type': 'application/vnd.api+json',
        'accept': 'application/vnd.api+json',
        'revision': '2025-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'campaign-message',
          id: campaignMessageId,
          relationships: {
            template: {
              data: {
                type: 'template',
                id: templateId
              }
            }
          }
        }
      })
    });

    const assignResponseText = await assignResponse.text();
    console.log(`Assign template response status: ${assignResponse.status}`);
    if (!assignResponse.ok) {
      console.log(`Assign template error: ${assignResponseText}`);
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          campaignId,
          error: `Campaign created but template assignment failed`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Template assigned to campaign successfully`);

    // Build the campaign URL for Klaviyo - correct template editor URL format
    const campaignUrl = `https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`;

    // Send preview email if requested
    let previewSent = false;
    if (sendPreviewTo && campaignMessageId) {
      console.log(`Sending preview email to: ${sendPreviewTo}`);
      
      try {
        const previewResponse = await fetch('https://a.klaviyo.com/api/campaign-message-preview-jobs', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${resolvedKlaviyoApiKey}`,
            'Content-Type': 'application/vnd.api+json',
            'accept': 'application/vnd.api+json',
            'revision': '2025-10-15'
          },
          body: JSON.stringify({
            data: {
              type: 'campaign-message-preview-job',
              attributes: {
                emails: [sendPreviewTo]
              },
              relationships: {
                'campaign-message': {
                  data: {
                    type: 'campaign-message',
                    id: campaignMessageId
                  }
                }
              }
            }
          })
        });

        if (previewResponse.ok) {
          console.log('Preview email queued successfully');
          previewSent = true;
        } else {
          const previewError = await previewResponse.text();
          console.error('Failed to send preview email:', previewError);
          // Don't fail the whole operation - just log the error
        }
      } catch (previewErr) {
        console.error('Preview email error:', previewErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        templateId,
        campaignId,
        campaignUrl,
        previewSent,
        message: 'Campaign created successfully with template',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in push-to-klaviyo:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
